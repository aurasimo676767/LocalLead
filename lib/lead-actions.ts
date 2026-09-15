import { now, uid, type Lead } from "./model";
import { patchSchema, inputSchema } from "./validation";
import { scoreLead } from "./scoring";
import { safeUrl, dedupKeys } from "./utils";
export function manualSources(l: Lead): Lead {
  const sources = l.sources.filter((s) => s.source_type !== "manual");
  for (const key of [
    "website_url",
    "facebook_url",
    "instagram_url",
    "menu_url",
  ] as const)
    if (safeUrl(l[key]))
      sources.push({
        id: uid(),
        source_type: "manual",
        url: l[key],
        confidence: 1,
        metadata_json: { field: key, verified_by_user: true },
        created_at: now(),
      });
  return { ...l, sources };
}
export function patchLead(lead: Lead, raw: unknown): Lead {
  const p = patchSchema.parse(raw);
  const {
    verification_url,
    verification_note,
    channel,
    event_notes,
    ...fields
  } = p;
  if (
    fields.status === "contacted" &&
    (lead.do_not_contact || lead.analysis.permanently_closed)
  )
    throw new Error("Questo lead è escluso dai contatti");
  const l = {
    ...lead,
    ...fields,
    analysis: {
      ...lead.analysis,
      evidence: [...lead.analysis.evidence],
      dedup_aliases: dedupKeys(lead),
    },
    events: [...lead.events],
    updated_at: now(),
  };
  const linksChanged = [
    "website_url",
    "menu_url",
    "facebook_url",
    "instagram_url",
    "phone",
  ].some(
    (k) =>
      k in fields && fields[k as keyof typeof fields] !== lead[k as keyof Lead],
  );
  if (linksChanged) {
    l.analysis = {
      ...l.analysis,
      evidence: l.analysis.evidence.filter(
        (e) =>
          ![
            "weak_website",
            "sparse",
            "good_website",
            "no_website",
            "website_unreachable",
            "events",
            "menu_ads",
            "whatsapp",
          ].includes(e.kind),
      ),
      features: null,
      events_relevant: false,
      analyzed_at: null,
    };
    l.website_status = "unknown";
    l.website_quality = "unknown";
    l.menu_status = "unknown";
    l.whatsapp_confidence = l.phone ? "uncertain" : "not_available";
    l.main_problem = "Dati modificati: rianalizza il lead";
    l.ai_summary = "";
  }
  if (
    p.whatsapp_confidence &&
    ["confirmed_business", "likely_business"].includes(p.whatsapp_confidence)
  ) {
    if (!l.phone || !verification_url || !verification_note?.trim())
      throw new Error(
        "Per verificare WhatsApp servono numero, URL pubblico ed evidenza",
      );
    l.analysis.evidence = l.analysis.evidence.filter(
      (e) => e.kind !== "whatsapp",
    );
    l.analysis.evidence.push({
      id: uid(),
      kind: "whatsapp",
      text: verification_note,
      url: verification_url,
      confidence: p.whatsapp_confidence === "confirmed_business" ? 1 : 0.8,
    });
    l.whatsapp_confidence = p.whatsapp_confidence;
  }
  if (
    p.website_status &&
    ["none", "social_only", "external_page_only"].includes(p.website_status)
  ) {
    if (!verification_url || !verification_note?.trim())
      throw new Error("La verifica del sito richiede una fonte e una nota");
    l.analysis.evidence = l.analysis.evidence.filter(
      (e) => e.kind !== "no_website",
    );
    l.analysis.evidence.push({
      id: uid(),
      kind: "no_website",
      text: verification_note,
      url: verification_url,
      confidence: 0.9,
    });
    l.website_status = p.website_status;
  }
  if (verification_url && verification_note)
    l.sources = [
      ...l.sources,
      {
        id: uid(),
        source_type: "manual_verification",
        url: verification_url,
        confidence: 1,
        metadata_json: { note: verification_note },
        created_at: now(),
      },
    ];
  if (p.do_not_contact === true) l.status = "archived";
  l.events.push({
    id: uid(),
    event_type:
      p.do_not_contact === true ? "do_not_contact" : p.status || "updated",
    notes: event_notes || verification_note || "Lead aggiornato",
    ...(channel ? { channel } : {}),
    created_at: now(),
  });
  return scoreLead(manualSources(l));
}
export function csvRows(rows: unknown[]) {
  return rows.map((r, i) => {
    const parsed = inputSchema.safeParse(r);
    return {
      row: i + 2,
      data: parsed.success ? parsed.data : null,
      error: parsed.success
        ? ""
        : parsed.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; "),
    };
  });
}
