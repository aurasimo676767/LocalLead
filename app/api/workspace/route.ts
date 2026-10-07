import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { publicConfig } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import {
  allLeads,
  deleteAllLeads,
  deleteLeads,
  dismissedKeys,
  getLead,
  getWorkspace,
  getPreferences,
  saveLead,
} from "@/lib/supabase/repository";
import {
  inputSchema,
  discoverySchema,
  settingsPreferences,
} from "@/lib/validation";
import { contactable, newLead, now, uid, type Preferences } from "@/lib/model";
import { manualSources, patchLead } from "@/lib/lead-actions";
import { placesProvider } from "@/lib/providers/places";
import { enrichLead } from "@/lib/enrichment";
import { analyzeLead, generateOutreachMessage } from "@/lib/ai";
import { dedupKeys, duplicate, normalizePhone } from "@/lib/utils";
import { scoreLead } from "@/lib/scoring";
import { buildOutreachContext } from "@/lib/messaging";
import { ensurePreview } from "@/lib/previews";
export const runtime = "nodejs";
export const maxDuration = 60;
class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function session(bucket: string) {
  if (publicConfig().demo)
    throw new HttpError("La demo usa solo i dati del browser", 403);
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new HttpError("Accedi per continuare", 401);
  const { data, error } = await db.rpc("consume_rate", { p_bucket: bucket });
  if (error)
    throw new HttpError(
      "Rate limit non configurato: esegui la migrazione Supabase",
      503,
    );
  if (!data)
    throw new HttpError("Troppe richieste: riprova tra un minuto", 429);
  return { db, user };
}
type Db = Awaited<ReturnType<typeof supabaseServer>>;
/**
 * Finds where the sender's city is once per city, so messages only say
 * "della zona" to nearby venues. A failed lookup is retried next time.
 */
async function locateSender(db: Db, userId: string, prefs: Preferences) {
  const city = prefs.sender_city.trim();
  if (prefs.sender_place === city) return prefs;
  let next: Preferences = {
    ...prefs,
    sender_place: city,
    sender_lat: null,
    sender_lng: null,
    sender_label: "",
  };
  if (city)
    try {
      const found = await placesProvider().locateCity(city);
      if (found)
        next = {
          ...next,
          sender_lat: found.lat,
          sender_lng: found.lng,
          sender_label: found.label,
        };
    } catch {
      console.warn("[settings] sender city lookup failed");
      return prefs;
    }
  const { error } = await db
    .from("profiles")
    .update({ preferences: next })
    .eq("id", userId);
  return error ? prefs : next;
}
function failure(error: unknown) {
  console.warn("[errors] workspace", {
    type: error instanceof Error ? error.constructor.name : "unknown",
  });
  return NextResponse.json(
    {
      error:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          : error instanceof Error
            ? error.message
            : "Errore inatteso",
    },
    {
      status:
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
    },
  );
}
export async function GET() {
  try {
    const { db, user } = await session("read");
    const workspace = await getWorkspace(db, user.id);
    workspace.preferences = await locateSender(
      db,
      user.id,
      workspace.preferences,
    );
    return NextResponse.json(workspace, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (
      !origin ||
      origin !== new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).origin
    )
      throw new HttpError("Origine richiesta non consentita", 403);
    const raw = await req.text();
    if (raw.length > 200_000)
      throw new HttpError("Richiesta troppo grande", 413);
    const body = z
      .object({
        action: z.enum([
          "create",
          "import",
          "patch",
          "analyze",
          "message",
          "save_message",
          "discover",
          "settings",
          "delete",
          "delete_all",
        ]),
        id: z.uuid().optional(),
        data: z.unknown().optional(),
      })
      .parse(JSON.parse(raw));
    const { db, user } = await session(
      ["analyze", "message", "discover"].includes(body.action)
        ? "expensive"
        : "write",
    );
    if (body.action === "settings") {
      // Coordinates always come from the lookup, never from the client.
      const parsed = settingsPreferences(body.data);
      const current = await getPreferences(db, user.id);
      const prefs =
        parsed.sender_city.trim() === current.sender_place
          ? {
              ...parsed,
              sender_place: current.sender_place,
              sender_lat: current.sender_lat,
              sender_lng: current.sender_lng,
              sender_label: current.sender_label,
            }
          : await locateSender(db, user.id, {
              ...parsed,
              sender_place: "",
              sender_lat: null,
              sender_lng: null,
              sender_label: "",
            });
      const { error } = await db
        .from("profiles")
        .update({ preferences: prefs })
        .eq("id", user.id);
      if (error) throw new Error("Preferenze non salvate");
      return NextResponse.json({ preferences: prefs });
    }
    if (body.action === "delete_all") {
      if (body.data !== "CANCELLA")
        throw new HttpError("Conferma la cancellazione di tutti i lead", 400);
      return NextResponse.json({
        deleted: await deleteAllLeads(db, user.id),
      });
    }
    if (body.action === "delete") {
      const input = z
        .object({
          ids: z.array(z.uuid()).min(1).max(2000),
          remember: z.boolean().default(true),
        })
        .parse(body.data);
      return NextResponse.json({
        deleted: await deleteLeads(db, input.ids, input.remember),
      });
    }
    if (body.action === "discover") {
      const input = discoverySchema.parse(body.data);
      const existing = await allLeads(db);
      // Places already in the workspace or removed before are never proposed again.
      const known = new Set([
        ...existing.flatMap((l) => dedupKeys(l)),
        ...(await dismissedKeys(db)),
      ]);
      let skipped = 0;
      const found = await placesProvider().searchBusinesses({
        ...input,
        known,
        onSkip: () => skipped++,
      });
      const results = [];
      for (const candidate of found) {
        if (duplicate(candidate, existing)) {
          skipped++;
          continue;
        }
        candidate.user_id = user.id;
        const l = scoreLead(candidate);
        const saved = await saveLead(db, l);
        if (saved.duplicate) {
          skipped++;
          continue;
        }
        if (!normalizePhone(l.phone)) continue;
        results.push({ lead: l, duplicate: false });
        existing.push(l);
      }
      return NextResponse.json({
        results,
        skipped,
        demo: found.some((l) => l.is_demo),
      });
    }
    if (body.action === "create") {
      let lead = manualSources(
        newLead({ ...inputSchema.parse(body.data), user_id: user.id }),
      );
      lead = scoreLead(lead);
      const saved = await saveLead(db, lead);
      return NextResponse.json({
        lead: await getLead(db, saved.id),
        duplicate: saved.duplicate,
      });
    }
    if (body.action === "import") {
      const inputs = z.array(inputSchema).min(1).max(10).parse(body.data);
      const results = [];
      const importErrors = [];
      for (const [index, input] of inputs.entries()) {
        try {
          const lead = scoreLead(
            manualSources(newLead({ ...input, user_id: user.id })),
          );
          const saved = await saveLead(db, lead);
          results.push({
            lead: await getLead(db, saved.id),
            duplicate: saved.duplicate,
          });
        } catch {
          importErrors.push({
            index,
            error: "Salvataggio non riuscito. Riprova questa riga.",
          });
        }
      }
      return NextResponse.json({ results, importErrors });
    }
    if (!body.id) throw new HttpError("ID richiesto", 400);
    const previous = await getLead(db, body.id);
    let lead = structuredClone(previous);
    let warning = "";
    if (body.action === "patch") lead = patchLead(lead, body.data);
    if (body.action === "analyze") {
      if (!lead.do_not_contact) {
        const analyzed = await enrichLead(lead);
        lead =
          analyzed.analysis.analyzed_at === previous.analysis.analyzed_at
            ? analyzed
            : await analyzeLead(analyzed);
      }
    }
    if (body.action === "message") {
      const preferences = await locateSender(
        db,
        user.id,
        await getPreferences(db, user.id),
      );
      const context = buildOutreachContext(lead, preferences);
      lead.analysis.outreach_context = context.status;
      lead.analysis.contact_reason = context.contactReason;
      const { data: recent, error } = await db
        .from("messages")
        .select("text")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw new Error("Cronologia messaggi non disponibile");
      // One time budget for preview and draft: the function stops at 60 s.
      const startedAt = Date.now();
      // The preview link goes in the draft; without it the draft goes out as before.
      if (contactable(lead) && context.status === "ready")
        lead.preview = (await ensurePreview(db, lead)) ?? lead.preview;
      const generated = await generateOutreachMessage(
        lead,
        preferences,
        (recent || []).map((m) => m.text).reverse(),
        startedAt,
      );
      warning = generated.warning;
      if (generated.text)
        lead.messages.push({
          id: uid(),
          message_type: "outreach",
          text: generated.text,
          model: generated.model,
          created_at: now(),
        });
    }
    if (body.action === "save_message") {
      const text = z
        .object({ text: z.string().trim().min(1).max(3000) })
        .parse(body.data).text;
      lead.messages.push({
        id: uid(),
        message_type: "edited",
        text,
        model: "manual",
        created_at: now(),
      });
    }
    lead.updated_at = now();
    const result = await saveLead(db, lead, previous.updated_at);
    return NextResponse.json({
      lead: await getLead(db, result.id),
      duplicate: result.duplicate,
      warning,
    });
  } catch (e) {
    return failure(e);
  }
}
