import type { Lead, SitePreview } from "./model";
import { sectorOf, type Sector } from "./sector";
import { normalizePhone } from "./utils";

export type SiteCopy = {
  title: string;
  intro: string;
  // Menu box for venues, rooms box for lodging.
  offer: string;
  contact: string;
};
export type SiteContent = {
  name: string;
  category: string;
  sector: Sector;
  city: string;
  address: string;
  phone: string;
  hours: string[];
  maps_url: string;
  menu_url: string;
  facebook_url: string;
  instagram_url: string;
  copy: SiteCopy;
};
const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
/** A link nobody can guess: the only key to a public preview. */
export function newSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
export const previewBase = () =>
  (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/+$/, "");
export const previewUrl = (slug: string) => `${previewBase()}/s/${slug}`;
/** The link to put in a draft, or "" when the lead has no live preview. */
export function previewLink(lead: Lead, now = new Date()) {
  const p = lead.preview;
  if (!p?.slug || new Date(p.expires_at) <= now) return "";
  return previewUrl(p.slug);
}
/** Only what the venue already shows the public: never notes, scores or drafts. */
export function siteContent(lead: Lead, copy: SiteCopy): SiteContent {
  return {
    name: lead.name,
    category: lead.category,
    sector: sectorOf(lead.category),
    city: lead.city,
    address: lead.address,
    phone: lead.phone,
    hours: lead.opening_hours,
    maps_url: lead.maps_url,
    menu_url: lead.menu_url,
    facebook_url: lead.facebook_url,
    instagram_url: lead.instagram_url,
    copy,
  };
}
const pick = <T>(pool: T[], variant: number, offset: number) =>
  pool[(variant + offset) % pool.length];
const productCategories = [
  "Panificio",
  "Pasticceria",
  "Gastronomia",
  "Gelateria",
  "Rosticceria",
  "Altro food",
];
/** Hand-written copy for when the AI is not available: warm, and no facts. */
export function fallbackCopy(lead: Lead, variant = 0): SiteCopy {
  const v = ((variant % 60) + 60) % 60;
  const city = lead.city.trim();
  const where = city ? ` a ${city}` : "";
  if (sectorOf(lead.category) === "alloggi") {
    const kind = lead.category === "B&B" ? "b&b" : "casa vacanze";
    return {
      title: pick(
        [
          `Il vostro posto per dormire${where}`,
          `Benvenuti nella nostra ${kind}!`,
          `Ciao! Siamo la vostra ${kind}${where}`,
        ],
        v,
        0,
      ),
      intro: pick(
        [
          "Che veniate per lavoro o per staccare un po', qui siete i benvenuti. Vi aspettiamo!",
          "Siamo contenti che siate passati di qui. Date un'occhiata e scriveteci quando volete!",
          "Qui trovate tutto quello che serve per organizzare il vostro soggiorno da noi.",
        ],
        v,
        1,
      ),
      offer: pick(
        [
          "Scriveteci per sapere se la camera è libera nei vostri giorni, vi rispondiamo appena possiamo.",
          "Dateci le vostre date e vi diciamo subito se c'è posto per voi.",
          "Raccontateci quando volete venire e vi diciamo se abbiamo posto.",
        ],
        v,
        2,
      ),
      contact: pick(
        [
          "Per qualsiasi cosa chiamateci o scriveteci, vi rispondiamo volentieri.",
          "Avete una domanda? Siamo qui, scriveteci quando volete.",
          "Ci trovate al telefono, come preferite voi.",
        ],
        v,
        0,
      ),
    };
  }
  const kind = lead.category.toLocaleLowerCase("it");
  const products = productCategories.includes(lead.category);
  return {
    title: pick(
      [
        `La nostra ${kind}${where}`,
        `Benvenuti da noi${where}!`,
        `Ciao! Questa è la nostra ${kind}`,
      ],
      v,
      0,
    ),
    intro: pick(
      [
        "Passa quando vuoi, ti aspettiamo! Qui trovi tutto quello che ti serve per venirci a trovare.",
        "Siamo felici che tu sia passato di qui. Dai un'occhiata e poi vieni a trovarci di persona!",
        "Che tu passi per caso o apposta, da noi sei sempre il benvenuto. Ti aspettiamo!",
      ],
      v,
      1,
    ),
    offer: products
      ? pick(
          [
            "Dai un'occhiata a quello che prepariamo e passa a trovarci quando vuoi.",
            "Curiosa tra le nostre cose buone con calma, poi vieni a sceglierle di persona.",
            "Qui sotto trovi quello che facciamo, il resto te lo raccontiamo quando passi.",
          ],
          v,
          2,
        )
      : pick(
          [
            "Dai un'occhiata al menu con calma e scegli quello che ti va, poi chiamaci o vieni direttamente.",
            "Il menu è qui sotto, sfoglialo pure con calma e poi passa a trovarci.",
            "Curiosa nel menu e scegli con calma, al resto pensiamo noi.",
          ],
          v,
          2,
        ),
    contact: pick(
      [
        "Per qualsiasi cosa chiamaci, ti rispondiamo volentieri.",
        "Hai una domanda? Chiamaci o passa a trovarci, siamo qui.",
        "Ci trovi al telefono o di persona, come preferisci tu.",
      ],
      v,
      0,
    ),
  };
}
// Facts we never have evidence for: numbers, years, rankings, ingredients, views.
const invented =
  /\d|\b(?:miglior[ei]?|più buon[aoei]|il top|numero uno|unic[oaie]|da generazioni|tradizion\w*|anni di|forno a legna|a legna|vista mare|sul mare|due passi|centro storico|premiat\w*|recension\w*|stelle|famos\w*|rinomat\w*|artigianal\w*|km zero|biologic\w*|ingredienti|selezionat\w*|eccellenz\w*|garantit\w*)/i;
const limits: Record<keyof SiteCopy, [number, number]> = {
  title: [8, 60],
  intro: [20, 220],
  offer: [20, 200],
  contact: [20, 160],
};
/** Why a preview text cannot be used; empty when it is fine. */
export function copyProblems(copy: SiteCopy) {
  const problems: string[] = [];
  for (const key of Object.keys(limits) as (keyof SiteCopy)[]) {
    const text = (copy[key] || "").trim();
    const [min, max] = limits[key];
    if (text.length < min || text.length > max)
      problems.push(`${key}: lunghezza tra ${min} e ${max} caratteri`);
    const hit = text.match(invented);
    if (hit)
      problems.push(
        `${key}: niente fatti che non conosciamo ("${hit[0]}"), scrivi solo frasi alla mano`,
      );
  }
  return problems;
}
// Link unfurlers fetch the page when a message is written or received.
const bots =
  /bot|crawl|spider|whatsapp|facebookexternalhit|facebot|telegram|slack|discord|preview|embedly|skype|linkedin|pinterest|vkshare|headless/i;
export const isPreviewBot = (userAgent: string) =>
  !userAgent.trim() || bots.test(userAgent);
/** "Mi interessa": a chat to the sender with the text already written. */
export function interestUrl(phone: string, senderName: string, venue: string) {
  const number = normalizePhone(phone);
  if (!number) return "";
  const hello = senderName.trim() ? `Ciao ${senderName.trim()}` : "Ciao";
  const text = `${hello}, ho visto l'anteprima del sito per ${venue}`;
  return `https://api.whatsapp.com/send?phone=${number.slice(1)}&text=${encodeURIComponent(text)}`;
}
/** "non ancora aperta" or "aperta 3 volte, ultima il 05/10". */
export function previewSummary(p: SitePreview) {
  if (!p.views || !p.last_viewed_at) return "non ancora aperta";
  const day = new Date(p.last_viewed_at).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
  return `aperta ${p.views === 1 ? "1 volta" : `${p.views} volte`}, ultima il ${day}`;
}
