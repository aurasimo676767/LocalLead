import type { Lead, ScoreReason } from "../model";
import { contactable } from "../model";
export function scoreLead(lead: Lead): Lead {
  const reasons: ScoreReason[] = [];
  const ev = lead.analysis.evidence;
  const add = (kind: string, label: string, points: number) => {
    const found = ev.filter((e) => e.kind === kind && e.confidence >= 0.7);
    if (found.length)
      reasons.push({ label, points, evidence_ids: found.map((e) => e.id) });
  };
  if (
    ["none", "social_only", "external_page_only"].includes(lead.website_status)
  )
    add("no_website", "Nessun sito proprietario verificato", 30);
  add("website_missing", "Sito non indicato da Google Places: da verificare", 25);
  if (["poor", "broken"].includes(lead.website_quality))
    add("weak_website", "Sito migliorabile: criticità rilevate", 25);
  add("menu_ads", "Elementi pubblicitari nel menu", 15);
  add("facebook_active", "Pagina Facebook attiva verificata", 10);
  if (
    ["confirmed_business", "likely_business"].includes(lead.whatsapp_confidence)
  )
    add("whatsapp", "Contatto WhatsApp business verificato", 10);
  if (!["good", "excellent"].includes(lead.website_quality))
    add("curated_social", "Foto curate, presenza web migliorabile", 8);
  if (lead.analysis.events_relevant && !lead.analysis.features?.has_events_page)
    add("events", "Serate reali senza una sezione dedicata", 8);
  if (lead.reviews_count >= 50) add("reviews", "Almeno 50 recensioni", 5);
  if (lead.website_quality === "good")
    add("good_website", "Sito completo: priorità bassa", -30);
  if (lead.website_quality === "excellent")
    add("good_website", "Sito ottimo: non contattare", -40);
  add("inactive", "Attività poco attiva: verifica necessaria", -20);
  add("out_of_target", "Attività fuori target", -50);
  const reliableContact =
    !!lead.facebook_url ||
    ["confirmed_business", "likely_business"].includes(
      lead.whatsapp_confidence,
    );
  if (!reliableContact && (lead.phone || lead.facebook_url || lead.website_url))
    reasons.push({
      label: "Canale di contatto da verificare",
      points: -5,
      evidence_ids: [],
    });
  const verified = ev.filter((e) => e.confidence >= 0.7);
  const confidence = verified.length
    ? Math.round(
        (100 * verified.reduce((n, e) => n + e.confidence, 0)) /
          verified.length,
      )
    : 20;
  let score = Math.min(
    100,
    Math.max(0, 20 + reasons.reduce((n, r) => n + r.points, 0)),
  );
  if (confidence < 60) score = Math.min(score, 39);
  if (lead.analysis.permanently_closed || lead.do_not_contact) {
    score = 0;
    reasons.push({
      label: lead.do_not_contact ? "Non contattare" : "Chiuso permanentemente",
      points: -100,
      evidence_ids: ev.filter((e) => e.kind === "closed").map((e) => e.id),
    });
  }
  const positive = reasons
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);
  const main =
    positive[0]?.label ||
    (lead.website_quality === "excellent" || lead.website_quality === "good"
      ? "Sito buono: non contattare"
      : "Nessuna opportunità verificata");
  const weak = ["poor", "broken"].includes(lead.website_quality);
  const opportunity = ev.some(
    (e) => e.kind === "menu_ads" && e.confidence >= 0.7,
  )
    ? "Menu proprietario più pulito"
    : weak
      ? "Restyling per valorizzare contenuti, foto e contatti"
      : ["none", "social_only", "external_page_only"].includes(
            lead.website_status,
          ) &&
          positive.some((r) =>
            r.evidence_ids.some((id) =>
              ev.some(
                (e) =>
                  e.id === id && ["no_website", "website_missing"].includes(e.kind),
              ),
            ),
          )
        ? "Un sito proprietario con le informazioni del locale"
        : "Verifica manuale prima di proporre un intervento";
  return {
    ...lead,
    lead_score: score,
    confidence_score: confidence,
    main_problem: main,
    opportunity,
    analysis: { ...lead.analysis, reasons },
    status: lead.analysis.permanently_closed ? "bad_lead" : lead.status,
  };
}
export function fitsFilter(l: Lead, filter: string) {
  const none = ["none", "social_only", "external_page_only"].includes(
    l.website_status,
  );
  const weak = ["poor", "broken", "average"].includes(l.website_quality);
  return filter === "none"
    ? none
    : filter === "weak"
      ? weak
      : filter === "weak_or_none"
        ? none || weak
        : true;
}
export const hotReasons = (lead: Lead) =>
  lead.analysis.reasons
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
export const worthwhile = (lead: Lead) =>
  contactable(lead) &&
  lead.lead_score >= 40 &&
  !["excellent", "good"].includes(lead.website_quality) &&
  lead.analysis.evidence.some(
    (e) =>
      e.confidence >= 0.7 &&
      (((e.kind === "no_website" || e.kind === "website_missing") &&
        ["none", "social_only", "external_page_only"].includes(
          lead.website_status,
        )) ||
        (e.kind === "weak_website" &&
          ["poor", "broken"].includes(lead.website_quality)) ||
        e.kind === "menu_ads" ||
        (e.kind === "events" &&
          lead.website_status === "own_website" &&
          !lead.analysis.features?.has_events_page)),
  );
