import { contactable, type Lead, type SitePreview } from "./model";
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
const absolute = (value: string) =>
  /^https?:\/\/[^/\s]+/i.test(value.trim())
    ? value.trim().replace(/\/+$/, "")
    : "";
/**
 * Where preview links point. Only an absolute address works inside a WhatsApp
 * message; in the browser the app's own address is a safe fallback (demo).
 */
export const previewBase = () =>
  absolute(process.env.NEXT_PUBLIC_SITE_URL || "") ||
  absolute(process.env.NEXT_PUBLIC_APP_URL || "") ||
  (typeof window !== "undefined" ? window.location.origin : "");
export const previewUrl = (slug: string) => `${previewBase()}/s/${slug}`;
/** The link to put in a draft, or "" when there is no live, reachable preview. */
export function previewLink(lead: Lead, now = new Date()) {
  const p = lead.preview;
  if (!p?.slug || new Date(p.expires_at) <= now || !contactable(lead))
    return "";
  return previewBase() ? previewUrl(p.slug) : "";
}
/** The category as a visitor should read it: never the internal "Altro food". */
export const placeLabel = (category: string) =>
  category === "Altro food" ? "Locale" : category;
// "la nostra pizzeria", "il nostro bar": the article follows the noun.
const ourPlaces: Record<string, string> = {
  Pizzeria: "la nostra pizzeria",
  Panineria: "la nostra panineria",
  Ristorante: "il nostro ristorante",
  Bar: "il nostro bar",
  Pub: "il nostro pub",
  "Cocktail bar": "il nostro cocktail bar",
  Pasticceria: "la nostra pasticceria",
  Gelateria: "la nostra gelateria",
  Panificio: "il nostro panificio",
  Gastronomia: "la nostra gastronomia",
  Rosticceria: "la nostra rosticceria",
  "B&B": "il nostro b&b",
  "Casa vacanza": "la nostra casa vacanze",
};
const ourPlace = (category: string) =>
  ourPlaces[category] || "il nostro locale";
const thisIs = (place: string) =>
  `${place.startsWith("la ") ? "Questa è" : "Questo è"} ${place}`;
/** A stable variant per lead, so venues without AI copy do not all read the same. */
export const copyVariant = (id: string) =>
  [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % 60;
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
  const place = ourPlace(lead.category);
  if (sectorOf(lead.category) === "alloggi") {
    return {
      title: pick(
        [
          `Il vostro posto per dormire${where}`,
          "Benvenuti, fate come a casa vostra!",
          `Ciao! ${thisIs(place)}`,
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
  const products = productCategories.includes(lead.category);
  return {
    title: pick(
      [
        "Ciao, benvenuti da noi!",
        "Che bello vederti da queste parti!",
        `${thisIs(place)}, ti aspettiamo`,
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
// Claims about taste, history, ingredients, views and services: none of it is in our data.
const inventedMore =
  /(?<!\p{L})(?:più \p{L}+|\p{L}*issim\p{L}*|vista|panoram\p{L}*|terrazz\p{L}*|giardin\p{L}*|colazion\p{L}*|parchegg\p{L}*|wi-?fi|piscin\p{L}*|nonn\p{L}*|ricett\p{L}*|come una volta|da sempre|dal \p{L}+|fresc\p{L}*|impast\p{L}*|lievit\p{L}*|mozzarell\p{L}*|bufal\p{L}*)/iu;
// Brochure words: the page must read as written by the owner, not by an agency.
const agency =
  /\b(?:qualit|esperienz|passion|professional|soluzion|offriamo|servizi|per qualsiasi informazion|non esitate|siamo liet|saremo (?:felici|liet)|lieti di)/i;
const limits: Record<keyof SiteCopy, [number, number]> = {
  title: [8, 60],
  intro: [20, 220],
  offer: [20, 200],
  contact: [20, 160],
};
/** Why a preview text cannot be used; empty when it is fine. */
export function copyProblems(copy: SiteCopy, venue = "") {
  const problems: string[] = [];
  for (const key of Object.keys(limits) as (keyof SiteCopy)[]) {
    const text = (copy[key] || "").trim();
    const [min, max] = limits[key];
    if (text.length < min || text.length > max)
      problems.push(`${key}: lunghezza tra ${min} e ${max} caratteri`);
    const hit = text.match(invented) || text.match(inventedMore);
    if (hit)
      problems.push(
        `${key}: niente fatti che non conosciamo ("${hit[0]}"), scrivi solo frasi alla mano`,
      );
    const stiff = text.match(agency);
    if (stiff)
      problems.push(
        `${key}: "${stiff[0]}" suona da agenzia, scrivi come parlerebbe il titolare`,
      );
  }
  // The name, category and city are printed right above the title.
  const plain = (v: string) =>
    v.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("it").trim();
  if (
    venue.trim().length >= 3 &&
    plain(copy.title || "").includes(plain(venue))
  )
    problems.push(
      "title: non ripetere il nome del locale, è già scritto sopra",
    );
  return problems;
}
// Link unfurlers fetch the page when a message is written or received.
const bots =
  /^whatsapp\/|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|embedly|vkshare|pinterestbot|googlebot|bingbot|applebot|yandex|bot\/|crawl|spider|headless/i;
export const isPreviewBot = (userAgent: string) =>
  !userAgent.trim() || bots.test(userAgent);
/**
 * "Mi interessa": a chat to the sender with a plain text already written. The
 * venue is not named: the reply comes from its number ("Cerca numero").
 */
export function interestUrl(phone: string, senderName: string) {
  const number = normalizePhone(phone);
  if (!number) return "";
  const hello = senderName.trim() ? `Ciao ${senderName.trim()}` : "Ciao";
  const text = `${hello}, sono interessato al sito`;
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
