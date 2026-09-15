import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { publicConfig } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import {
  allLeads,
  getLead,
  getWorkspace,
  saveLead,
} from "@/lib/supabase/repository";
import { inputSchema, discoverySchema } from "@/lib/validation";
import { newLead, now, uid, preferencesSchema } from "@/lib/model";
import { manualSources, patchLead } from "@/lib/lead-actions";
import { placesProvider } from "@/lib/providers/places";
import { enrichLead } from "@/lib/enrichment";
import { analyzeLead, generateOutreachMessage } from "@/lib/ai";
import { duplicate } from "@/lib/utils";
import { scoreLead } from "@/lib/scoring";
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
    return NextResponse.json(await getWorkspace(db, user.id), {
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
          "patch",
          "analyze",
          "message",
          "save_message",
          "discover",
          "settings",
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
      const prefs = preferencesSchema.parse(body.data);
      const { error } = await db
        .from("profiles")
        .update({ preferences: prefs })
        .eq("id", user.id);
      if (error) throw new Error("Preferenze non salvate");
      return NextResponse.json({ preferences: prefs });
    }
    if (body.action === "discover") {
      const input = discoverySchema.parse(body.data);
      const found = await placesProvider().searchBusinesses(input);
      const existing = await allLeads(db);
      const results = [];
      for (const candidate of found) {
        const prev = duplicate(candidate, existing);
        if (prev?.do_not_contact) continue;
        if (prev) {
          results.push({ lead: prev, duplicate: true });
          continue;
        }
        candidate.user_id = user.id;
        const l = scoreLead(candidate);
        const saved = await saveLead(db, l);
        const stored = saved.duplicate ? await getLead(db, saved.id) : l;
        if (stored.do_not_contact) continue;
        results.push({ lead: stored, duplicate: saved.duplicate });
        existing.push(stored);
      }
      return NextResponse.json({ results, demo: found.some((l) => l.is_demo) });
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
      const { preferences } = await getWorkspace(db, user.id);
      const { data: recent, error } = await db
        .from("messages")
        .select("text")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw new Error("Cronologia messaggi non disponibile");
      const generated = await generateOutreachMessage(
        lead,
        preferences,
        (recent || []).map((m) => m.text).reverse(),
      );
      warning = generated.warning;
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
