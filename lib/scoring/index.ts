import type { Evidence, Lead, Preferences, ScoreReason } from "../model";
import { contactable } from "../model";
import { websiteFailureEvidence } from "../website-evidence";
import { senderReach } from "../messaging";
import { isLandlinePhone, normalizePhone, portalFromText } from "../utils";
import { sectorOf } from "../sector";
type Part = NonNullable<ScoreReason["group"]>;
type Candidate = { label: string; points: number; ids: string[] };
const NO_SITE = ["none", "social_only", "external_page_only"];
const reliable = (lead: Lead, kind: string) =>
  lead.analysis.evidence.filter((e) => e.kind === kind && e.confidence >= 0.7);
const ids = (items: { id: string }[]) => items.map((e) => e.id);
// Where the record itself comes from: the phone, reviews and position.
const origin = (lead: Lead) =>
  lead.sources.find(
    (s) =>
      ["google_places", "demo"].includes(s.source_type) && s.confidence >= 0.7,
  );
function needs(lead: Lead): Candidate[] {
  const food = sectorOf(lead.category) === "locali";
  const found: Candidate[] = [];
  const push = (label: string, points: number, items: { id: string }[]) => {
    if (items.length) found.push({ label, points, ids: ids(items) });
  };
  const noSite: Evidence[] = NO_SITE.includes(lead.website_status)
    ? reliable(lead, "no_website")
    : [];
  const portal = noSite.map((e) => portalFromText(e.text)).find(Boolean);
  if (lead.website_status === "social_only")
    push("Come sito c'è solo una pagina social", 45, noSite);
  else if (portal) push(`Come sito c'è solo la pagina ${portal}`, 50, noSite);
  else push("Nessun sito proprietario verificato", 50, noSite);
  if (lead.website_status !== "own_website")
    push(
      "Sito non indicato da Google Places: da verificare",
      35,
      reliable(lead, "website_missing"),
    );
  const failure = websiteFailureEvidence(lead);
  push(
    "Il sito ha restituito un errore HTTP: da verificare",
    40,
    failure ? [failure] : [],
  );
  if (["poor", "broken"].includes(lead.website_quality))
    push(
      "Sito migliorabile: criticità rilevate",
      30,
      reliable(lead, "weak_website"),
    );
  push("Sito con pochissimi contenuti", 30, reliable(lead, "sparse"));
  if (food)
    push("Elementi pubblicitari nel menu", 25, reliable(lead, "menu_ads"));
  push("Pubblicità sul sito", 20, reliable(lead, "site_ads"));
  if (
    food &&
    lead.analysis.events_relevant &&
    !lead.analysis.features?.has_events_page
  )
    push(
      "Serate reali senza una sezione dedicata",
      20,
      reliable(lead, "events"),
    );
  return found.sort((a, b) => b.points - a.points);
}
function reach(lead: Lead): Candidate | null {
  const wa = reliable(lead, "whatsapp");
  if (
    wa.length &&
    ["confirmed_business", "likely_business"].includes(lead.whatsapp_confidence)
  )
    return { label: "WhatsApp business verificato", points: 30, ids: ids(wa) };
  const from = origin(lead);
  const phone = normalizePhone(lead.phone);
  if (phone && !isLandlinePhone(phone) && from)
    return {
      label: "Cellulare pubblico: WhatsApp da verificare",
      points: 22,
      ids: [from.id],
    };
  const socialSource =
    lead.sources.find(
      (s) =>
        s.confidence >= 0.7 &&
        !!s.url &&
        (s.url === lead.facebook_url || s.url === lead.instagram_url),
    ) || reliable(lead, "facebook_active")[0];
  if ((lead.facebook_url || lead.instagram_url) && socialSource)
    return {
      label: "Raggiungibile su Facebook o Instagram",
      points: 12,
      ids: [socialSource.id],
    };
  if (phone && from)
    return { label: "Solo numero fisso", points: 5, ids: [from.id] };
  return null;
}
function activity(lead: Lead, prefs?: Preferences): Candidate[] {
  const found: Candidate[] = [];
  const from = origin(lead);
  const reviewSource = reliable(lead, "reviews")[0] || from;
  const n = lead.reviews_count;
  if (reviewSource && n > 0)
    found.push(
      n >= 50
        ? {
            label: "Attività viva: 50+ recensioni",
            points: 12,
            ids: [reviewSource.id],
          }
        : n >= 10
          ? {
              label: "Attività viva: 10–49 recensioni",
              points: 8,
              ids: [reviewSource.id],
            }
          : {
              label: "Poche recensioni su Google",
              points: 2,
              ids: [reviewSource.id],
            },
    );
  const social = [
    ...reliable(lead, "facebook_active"),
    ...reliable(lead, "curated_social"),
  ];
  if (social.length)
    found.push({
      label: "Social attivi verificati",
      points: 4,
      ids: ids(social),
    });
  if (prefs && from && senderReach(lead, prefs).reach !== "far")
    found.push({ label: "Vicino a te", points: 4, ids: [from.id] });
  return found;
}
const toReason = (
  c: Candidate,
  group: Part,
  points = c.points,
): ScoreReason => ({ label: c.label, points, evidence_ids: c.ids, group });
/** Sum of each part of the score, for the breakdown on the lead page. */
export function scoreParts(lead: Lead) {
  const parts = { need: 0, reach: 0, activity: 0, penalty: 0 };
  for (const r of lead.analysis.reasons)
    if (r.group) parts[r.group] += r.points;
  const total = Math.min(
    100,
    Math.max(0, parts.need + parts.reach + parts.activity + parts.penalty),
  );
  // Caps (good site, low confidence, opt-out) can lower the score below the sum.
  return { ...parts, total, capped: lead.lead_score < total };
}
export function scoreLead(lead: Lead, prefs?: Preferences): Lead {
  const ev = lead.analysis.evidence;
  const need = needs(lead);
  // The strongest need scores; the others stay listed, at zero, as context.
  const reasons: ScoreReason[] = need.map((c, i) =>
    toReason(c, "need", i === 0 ? c.points : 0),
  );
  // A busy, reachable venue with no need for a site is not a lead.
  if (need.length) {
    const r = reach(lead);
    if (r) reasons.push(toReason(r, "reach"));
    for (const a of activity(lead, prefs))
      reasons.push(toReason(a, "activity"));
  }
  for (const [kind, label, points] of [
    ["inactive", "Attività poco attiva: verifica necessaria", -20],
    ["out_of_target", "Attività fuori target", -50],
  ] as const) {
    const found = reliable(lead, kind);
    if (found.length)
      reasons.push({
        label,
        points,
        evidence_ids: ids(found),
        group: "penalty",
      });
  }
  const verified = ev.filter((e) => e.confidence >= 0.7);
  const confidence = verified.length
    ? Math.round(
        (100 * verified.reduce((n, e) => n + e.confidence, 0)) /
          verified.length,
      )
    : 20;
  let score = Math.min(
    100,
    Math.max(
      0,
      reasons.reduce((n, r) => n + r.points, 0),
    ),
  );
  if (lead.website_quality === "excellent") score = Math.min(score, 15);
  if (lead.website_quality === "good") score = Math.min(score, 25);
  if (confidence < 60) score = Math.min(score, 39);
  if (lead.analysis.permanently_closed || lead.do_not_contact) {
    score = 0;
    reasons.push({
      label: lead.do_not_contact ? "Non contattare" : "Chiuso permanentemente",
      points: -100,
      evidence_ids: ev.filter((e) => e.kind === "closed").map((e) => e.id),
      group: "penalty",
    });
  }
  const positive = reasons
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);
  // The main problem is a need: reach and activity explain priority, not why to write.
  const main =
    positive.find((r) => r.group === "need")?.label ||
    (lead.website_quality === "excellent" || lead.website_quality === "good"
      ? "Sito buono: non contattare"
      : "Nessuna opportunità verificata");
  const unavailable = !!websiteFailureEvidence(lead);
  const weak = lead.website_quality === "poor";
  const lodging = sectorOf(lead.category) === "alloggi";
  const missingSite =
    NO_SITE.includes(lead.website_status) &&
    ev.some(
      (e) =>
        e.confidence >= 0.7 &&
        ["no_website", "website_missing"].includes(e.kind),
    );
  const opportunity = unavailable
    ? "Verificare l’errore restituito dal sito prima di proporre modifiche"
    : !lodging && ev.some((e) => e.kind === "menu_ads" && e.confidence >= 0.7)
      ? "Menu proprietario più pulito"
      : weak
        ? "Restyling per valorizzare contenuti, foto e contatti"
        : missingSite && need.length
          ? lodging
            ? "Un sito vostro dove ricevere richieste e prenotazioni dirette"
            : "Un sito proprietario con le informazioni del locale"
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
          !lead.analysis.features?.has_events_page) ||
        (e.id === websiteFailureEvidence(lead)?.id &&
          ["unknown", "broken"].includes(lead.website_quality))),
  );
