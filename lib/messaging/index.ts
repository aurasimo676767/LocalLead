import { contactable, type Lead, type Preferences } from "../model";
import { websiteFailureEvidence } from "../website-evidence";
import { sectorOf } from "../sector";
import { portalFromText, portalNames } from "../utils";
import { lodgingLines } from "./lodging";
import { previewLink } from "../site-preview";
export type ContactReasonKind =
  | "no_website"
  | "social_only"
  | "broken_website"
  | "poor_website"
  | "sparse_website"
  | "menu_ads"
  | "instagram_menu_only"
  | "good_socials_bad_web"
  | "events_no_website"
  | "portal_only";
export type OutreachAttribution = {
  id: string;
  text: string;
  url: string;
  confidence: number;
};
export type OutreachContext = {
  status: "ready" | "insufficient_outreach_context";
  reasonKind: ContactReasonKind | null;
  contactReason: string;
  verifiedObservations: string[];
  websiteIssues: string[];
  positiveSignals: string[];
  suggestedFeatures: string[];
  attributions: OutreachAttribution[];
};
export function similarity(a: string, b: string) {
  const grams = (s: string) => {
    const words = s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean);
    return new Set(words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`));
  };
  const x = grams(a),
    y = grams(b);
  if (!x.size || !y.size) return a === b ? 1 : 0;
  return [...x].filter((v) => y.has(v)).length / new Set([...x, ...y]).size;
}
export function messageFacts(l: Lead, p: Preferences) {
  const has = (kind: string) =>
    l.analysis.evidence.some(
      (e) => e.kind === kind && e.confidence >= 0.7 && !!e.url,
    );
  const products = [
    "Panificio",
    "Pasticceria",
    "Gastronomia",
    "Gelateria",
    "Rosticceria",
    "Altro food",
  ].includes(l.category);
  const unavailable = !!websiteFailureEvidence(l);
  const lodging = sectorOf(l.category) === "alloggi";
  return {
    unavailable,
    own: l.website_status === "own_website" || l.website_status === "broken",
    missing:
      has("no_website") &&
      (!l.website_url ||
        ["social_only", "external_page_only"].includes(l.website_status)) &&
      l.website_status !== "own_website" &&
      !unavailable,
    listingMissing: has("website_missing"),
    weak: has("weak_website") || has("sparse"),
    sparse: has("sparse"),
    poor: l.website_quality === "poor" && has("weak_website"),
    ads: has("menu_ads"),
    events: !lodging && p.events && l.analysis.events_relevant && has("events"),
    products,
    lodging,
    drinks: ["Pub", "Cocktail bar"].includes(l.category),
    qr: p.qr && !products && !lodging,
  };
}

// Written by enrichment when Google's website field is a social or third-party page.
export const platformPrefix = "Su Google Maps il sito indicato è";
export function buildOutreachContext(
  lead: Lead,
  prefs: Preferences,
): OutreachContext {
  const evidence = lead.analysis.evidence.filter(
    (e) => e.confidence >= 0.7 && !!e.url,
  );
  const first = (kind: string) => evidence.find((e) => e.kind === kind);
  const lodging = sectorOf(lead.category) === "alloggi";
  const place = lodging ? "della struttura" : "del locale";
  const unavailable = websiteFailureEvidence(lead);
  const ads = lodging ? undefined : first("menu_ads");
  const weak = first("weak_website");
  const wordCount =
    lead.analysis.features?.word_count ??
    Number(weak?.text.match(/\b(\d+) parole\b/i)?.[1] || 0);
  const sparse =
    first("sparse") || (wordCount >= 20 && wordCount < 250 ? weak : undefined);
  // HTML counters support a content observation, never a visual judgement.
  const visualWeak =
    weak && /(?:poco moderno|datato|vecchi|poco curat|grafica)/i.test(weak.text)
      ? weak
      : undefined;
  const noWebsite = messageFacts(lead, prefs).missing
    ? first("no_website")
    : undefined;
  const websiteMissing =
    !lead.website_url && lead.website_status !== "own_website"
      ? first("website_missing")
      : undefined;
  const events =
    !lodging && prefs.events && lead.analysis.events_relevant
      ? first("events")
      : undefined;
  const curated = first("curated_social");
  const menuSource = lead.menu_url
    ? lead.sources.find(
        (source) => source.url === lead.menu_url && source.confidence >= 0.7,
      )
    : undefined;
  const chosen: OutreachAttribution[] = [];
  let reasonKind: ContactReasonKind | null = null;
  let contactReason = "";
  const addAttributions = (...items: Array<typeof unavailable>) => {
    for (const item of items)
      if (item && !chosen.some((entry) => entry.id === item.id))
        chosen.push({
          id: item.id,
          text: item.text,
          url: item.url,
          confidence: item.confidence,
        });
  };
  if (unavailable) {
    reasonKind = "broken_website";
    contactReason =
      "il sito ufficiale esiste ma al momento non sembra funzionare";
    addAttributions(unavailable);
  } else if (ads) {
    reasonKind = "menu_ads";
    contactReason =
      "il menu è ospitato su una piattaforma esterna con molta pubblicità";
    addAttributions(ads);
  } else if (events && noWebsite) {
    reasonKind = "events_no_website";
    contactReason =
      "il locale pubblica serate o eventi ma non ha un sito dove raccoglierli";
    addAttributions(events, noWebsite);
  } else if (curated && (sparse || visualWeak)) {
    reasonKind = "good_socials_bad_web";
    contactReason = sparse
      ? "la pagina e le foto sono curate ma il sito contiene pochissimo materiale"
      : "la pagina e le foto sono curate ma il sito non è allo stesso livello";
    addAttributions(curated, sparse || visualWeak);
  } else if (sparse) {
    reasonKind = "sparse_website";
    contactReason =
      "il sito esiste ma contiene pochissimo materiale rispetto all’attività";
    addAttributions(sparse);
  } else if (visualWeak) {
    reasonKind = "poor_website";
    contactReason = "il sito esiste ma appare poco moderno e poco curato";
    addAttributions(visualWeak);
  } else if (!lodging && lead.menu_status === "instagram_only" && menuSource) {
    reasonKind = "instagram_menu_only";
    contactReason = "il menu è disponibile principalmente tramite Instagram";
    chosen.push({
      id: menuSource.id,
      text: "Menu pubblicato tramite Instagram",
      url: menuSource.url,
      confidence: menuSource.confidence,
    });
  } else if (noWebsite?.text.startsWith(platformPrefix)) {
    // Google lists a social page or a booking portal as the website.
    const portal = lodging ? portalFromText(noWebsite.text) : "";
    reasonKind = portal ? "portal_only" : "social_only";
    contactReason = portal
      ? `su Google come sito c'è solo la pagina ${portal}`
      : `su Google come sito ${place} c'è ${noWebsite.text.slice(platformPrefix.length).trim()}`;
    addAttributions(noWebsite);
  } else if (noWebsite) {
    reasonKind = "no_website";
    contactReason = `cercando su Google non ho trovato un sito ufficiale ${place}`;
    addAttributions(noWebsite);
  } else if (websiteMissing) {
    reasonKind = "no_website";
    contactReason =
      "cercando su Google non sono riuscito a trovare un sito ufficiale e non so se ne hanno già uno";
    addAttributions(websiteMissing);
  }
  if (!reasonKind || !chosen.length)
    return {
      status: "insufficient_outreach_context",
      reasonKind: null,
      contactReason: "",
      verifiedObservations: [],
      websiteIssues: [],
      positiveSignals: [],
      suggestedFeatures: [],
      attributions: [],
    };
  const suggestedFeatures: string[] = [];
  if (lodging)
    suggestedFeatures.push(
      "foto delle camere e degli spazi",
      "posizione e dintorni",
      "contatti diretti",
    );
  else {
    const menuFeature =
      lead.category === "Cocktail bar" || lead.category === "Pub"
        ? "drink list"
        : productCategories.includes(lead.category)
          ? "prodotti foto e contatti"
          : "menu";
    suggestedFeatures.push(menuFeature, "foto e contatti");
    if (prefs.qr && !productCategories.includes(lead.category))
      suggestedFeatures.push("QR code");
    if (reasonKind === "events_no_website")
      suggestedFeatures.unshift("spazio per serate ed eventi");
  }
  return {
    status: "ready",
    reasonKind,
    contactReason,
    verifiedObservations: [contactReason],
    websiteIssues: [contactReason],
    positiveSignals: [curated, events]
      .filter(Boolean)
      .map((item) => item!.text),
    suggestedFeatures: [...new Set(suggestedFeatures)],
    attributions: chosen,
  };
}

const productCategories = [
  "Panificio",
  "Pasticceria",
  "Gastronomia",
  "Gelateria",
  "Rosticceria",
  "Altro food",
];
const normalizePlace = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("it").trim();
// Venues within this distance of the sender's city count as "della zona".
export const LOCAL_KM = 40;
const km = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};
/**
 * How close the venue is to where the sender lives. Without both positions a
 * different city is "far": closeness is never claimed without evidence.
 */
export function senderReach(
  l: Lead,
  p: Preferences,
): { reach: "same" | "near" | "far"; km: number | null } {
  const city = p.sender_city.trim();
  if (city && normalizePlace(l.city) === normalizePlace(city))
    return { reach: "same", km: 0 };
  const located =
    !!city && normalizePlace(p.sender_place) === normalizePlace(city);
  if (
    located &&
    p.sender_lat !== null &&
    p.sender_lng !== null &&
    l.latitude !== null &&
    l.longitude !== null
  ) {
    const d = Math.round(
      km(p.sender_lat, p.sender_lng, l.latitude, l.longitude),
    );
    return { reach: d <= LOCAL_KM ? "near" : "far", km: d };
  }
  return { reach: "far", km: null };
}
/** "Della zona" and "qui vicino" only with the preference on and a nearby venue. */
export const localClaims = (l: Lead, p: Preferences) =>
  p.local && !!p.sender_city.trim() && senderReach(l, p).reach !== "far";
// Written the way the sender writes by hand: greeting, what he does, the doubt
// spelled out, what would go in the site, then the question.
export function senderIntro(l: Lead, p: Preferences, variant = 0) {
  const name = p.sender_name.trim();
  const city = p.sender_city.trim();
  const from =
    !localClaims(l, p) || !city
      ? ""
      : senderReach(l, p).reach === "same"
        ? ` e abito anche io a ${city}`
        : ` e abito a ${city} qui vicino a voi`;
  const local = localClaims(l, p) ? " della zona" : "";
  const target =
    sectorOf(l.category) === "alloggi"
      ? [
          "anche per b&b e case vacanza",
          "soprattutto per b&b e case vacanza",
          "per b&b e case vacanza",
        ]
      : [
          "specialmente per i locali",
          "soprattutto per i locali",
          "per bar e ristoranti",
        ];
  const line = !name
    ? `ciao buongiorno! mi occupo della realizzazione di siti web fatti su misura, ${target[0]}${local}`
    : [
        `ciao buongiorno! mi chiamo ${name}${from}, mi occupo della realizzazione di siti web fatti su misura, ${target[0]}${local}`,
        `ciao! mi chiamo ${name}${from} e faccio siti web su misura, ${target[1]}${local}`,
        `ciao buongiorno! mi chiamo ${name}${from}, faccio siti web fatti su misura ${target[2]}${local}`,
      ][variant % 3];
  // A neutral tone keeps the same words without the chatty opening.
  return p.tone === "neutro"
    ? line.replace(/^ciao buongiorno!|^ciao!/, "Ciao,").replace(/^./, "C")
    : line;
}
// Each line has its own pool. Neighbouring indexes differ on every line, so a
// regenerated draft reads as a new message rather than a new closing question.
const pick = <T>(pool: T[], variant: number, offset: number) =>
  pool[(variant + offset) % pool.length];
// The preview is the concrete thing to look at: it closes the pitch line.
const withPreview = (pitch: string, l: Lead) => {
  const link = previewLink(l);
  return link
    ? `${pitch}, intanto ve l'ho già preparato in anteprima, date un'occhiata ${link}`
    : pitch;
};
export function fallbackMessage(l: Lead, p: Preferences, index = 0) {
  if (!contactable(l)) return "";
  const context = buildOutreachContext(l, p);
  if (context.status !== "ready" || !context.reasonKind) return "";
  const variant = ((index % 60) + 60) % 60;
  if (sectorOf(l.category) === "alloggi") {
    const lines = lodgingLines(
      context.reasonKind,
      context.contactReason,
      variant,
    );
    return lines
      ? [
          senderIntro(l, p, variant),
          lines.observation,
          lines.why,
          withPreview(lines.pitch, l),
          lines.cta,
        ].join("\n")
      : "";
  }
  const isProduct = productCategories.includes(l.category);
  const menu = ["Pub", "Cocktail bar"].includes(l.category)
    ? "menu drink"
    : l.category === "Panificio"
      ? "prodotti"
      : "menu";
  const theMenu = menu === "prodotti" ? "i prodotti" : `il ${menu}`;
  // The photos worth showing depend on what the venue actually sells.
  const photos = ["Pub", "Cocktail bar"].includes(l.category)
    ? "le foto dei drink e dei taglieri"
    : ["Bar", "Pasticceria", "Gelateria"].includes(l.category)
      ? "le foto dei dolci, delle colazioni e degli aperitivi"
      : l.category === "Panificio"
        ? "le foto del pane e dei dolci"
        : "le foto dei piatti";
  const platform = context.contactReason.split("c'è ")[1] || "la pagina social";
  const unsure = context.contactReason.includes("non so")
    ? " e non so se ne avete già uno"
    : "";
  const newSite = [
    `si potrebbe farne uno su misura come piace a voi, con ${photos}, ${theMenu}, le foto del locale e la vostra storia se volete`,
    `ve lo farei apposta per voi, con ${photos}, ${theMenu} e le foto del locale, tutto con i vostri colori`,
    `lo costruiamo insieme come lo volete voi, con ${photos}, ${theMenu} e le foto del locale`,
  ];
  const copy: Record<
    Exclude<ContactReasonKind, "portal_only">,
    { observations: string[]; pitches: string[] }
  > = {
    no_website: {
      observations: [
        `ho visto che non avete un sito (almeno, ho cercato su google ma non ho trovato nulla) dove far vedere ${theMenu} e le foto di quello che fate${unsure}`,
        `ho cercato su google un vostro sito con ${theMenu} e le foto ma non ho trovato niente${unsure}`,
        `stavo cercando su google un vostro sito ma non l'ho trovato, e ${theMenu} e le foto si vedono solo sui social${unsure}`,
      ],
      pitches: newSite,
    },
    social_only: {
      observations: [
        `ho visto su google che come sito c'è ${platform}, ma un sito vostro vero e proprio non l'ho trovato`,
        `su google come sito viene fuori ${platform} e basta, e ${theMenu} si trova solo scorrendo i post`,
        `ho cercato su google e al posto del sito c'è ${platform}, quindi chi vi cerca deve mettersi a scorrere`,
      ],
      pitches: newSite,
    },
    broken_website: {
      observations: [
        "ho trovato il vostro sito su google ma ho provato ad aprirlo e non si apre",
        "ho provato ad aprire il vostro sito che c'è su google ma sembra non funzionare",
        "stavo guardando il vostro sito trovato su google ma non si apre",
      ],
      pitches: [
        `ve lo potrei sistemare come piace a voi, tenendo quello che avete già e mettendo bene in vista ${theMenu} e ${photos}`,
        `si potrebbe rifare su misura, con ${theMenu}, ${photos} e le informazioni che avete già`,
        `ve lo rimetto in piedi e lo facciamo come lo volete voi, con ${theMenu} e ${photos} sempre in vista`,
      ],
    },
    poor_website: {
      observations: [
        "ho visto su google il vostro sito e secondo me si potrebbe rendere parecchio più moderno",
        "ho dato un'occhiata al vostro sito trovato su google e l'aspetto si potrebbe curare molto meglio",
        "ho aperto il vostro sito da google e secondo me la grafica si potrebbe aggiornare",
      ],
      pitches: [
        `ve lo rifarei su misura con i vostri colori, tenendo ${theMenu} e le informazioni che avete già`,
        `si potrebbe sistemare grafica e menu come piace a voi, senza stravolgere tutto`,
        `lo renderei più curato e comodo dal telefono, con ${photos} messe come si deve`,
      ],
    },
    sparse_website: {
      observations: [
        "ho aperto il vostro sito da google ed è un peccato che ci sia così poco dentro",
        "ho visto il vostro sito su google e ci sono davvero pochi contenuti sull'attività",
        "sono andato sul vostro sito da google e al momento è molto scarno",
      ],
      pitches: [
        `lo completerei come piace a voi, con ${theMenu}, ${photos} e i contatti tutti in un posto`,
        `si potrebbe aggiungere quello che manca e renderlo più curato, con ${photos} e ${theMenu}`,
        `sistemerei contenuti e ${menu} su misura per voi, senza stravolgere il sito`,
      ],
    },
    menu_ads: {
      observations: [
        "ho aperto il vostro menu online da google e c'è parecchia pubblicità intorno",
        "ho aperto da google il vostro menu online ma gli annunci lo rendono poco pulito",
        "il menu che si trova da google è su una piattaforma piena di pubblicità",
      ],
      pitches: [
        `metterei ${theMenu} su un sito tutto vostro, pulito e fatto come piace a voi, con ${photos}`,
        `si potrebbe avere un menu vostro senza annunci, su misura con i vostri colori e ${photos}`,
        `vi farei un sito vostro con ${theMenu} e ${photos}, senza quella pubblicità`,
      ],
    },
    instagram_menu_only: {
      observations: [
        "ho cercato il menu su google e si trova praticamente solo su instagram",
        "cercando il menu da google sono finito su instagram",
        "su google non ho trovato un menu, sta solo tra i post di instagram",
      ],
      pitches: [
        `metterei ${theMenu} su un sito tutto vostro fatto su misura, con ${photos} e le foto del locale`,
        `si potrebbe avere ${theMenu} in un sito vostro, come piace a voi e più rapido da aprire`,
        `vi farei un sito come lo volete voi, con ${theMenu}, ${photos} e i contatti`,
      ],
    },
    good_socials_bad_web: {
      observations: [
        "ho guardato la vostra pagina e le foto sono curate, però il sito che c'è su google non è allo stesso livello",
        "sui social curate bene le foto mentre il sito trovato su google resta molto più scarno",
        "la vostra pagina è curata ma il sito che si trova da google stona un po' col resto",
      ],
      pitches: [
        `rifarei il sito su misura con lo stesso stile delle vostre foto e una parte dedicata a ${theMenu}`,
        "si potrebbe fare qualcosa di molto più curato e come piace a voi, in linea con la pagina",
        `lo renderei coerente con la pagina, con i vostri colori, ${photos} e ${theMenu}`,
      ],
    },
    events_no_website: {
      observations: [
        "ho visto che organizzate serate ma un vostro sito dove raccoglierle non l'ho trovato su google",
        "stavo guardando le vostre serate e su google non c'è un sito dove vederle tutte insieme",
        "ci sono le vostre serate ma un sito del locale su google non l'ho trovato",
      ],
      pitches: [
        `vi farei un sito su misura con le prossime date, ${theMenu} e i contatti`,
        `si potrebbero raccogliere serate e prossime date in un sito vostro, fatto come piace a voi`,
        `farei uno spazio per le serate con ${photos} e ${theMenu}, tutto con i vostri colori`,
      ],
    },
  };
  const selected =
    copy[context.reasonKind as Exclude<ContactReasonKind, "portal_only">];
  // Why a site matters, in plain words and without promising numbers.
  const why = pick(
    [
      `oggi quasi tutti prima di uscire guardano tutto dal telefono, e se trovano subito ${theMenu} e le foto è molto più facile che scelgano voi`,
      `la gente ormai decide dove andare guardando il telefono, e un sito curato con ${theMenu} e le foto fa davvero la differenza anche sulle vendite`,
      `chi vi cerca dal telefono vuole vedere subito ${theMenu} e qualche foto, e quando li trova è molto più propenso a passare da voi`,
      `secondo me oggi un sito curato con ${theMenu} e ${photos} aiuta tantissimo le vendite, perché la gente sceglie dal telefono`,
      `ormai funziona così, prima di uscire si guarda dal telefono e chi trova subito ${theMenu} in un sito curato ha molta più voglia di venire da voi`,
    ],
    variant,
    1,
  );
  let pitch = pick(selected.pitches, variant, 2);
  if (p.qr && !isProduct && !/qr/i.test(pitch))
    pitch += pick(
      [
        ", e ai tavoli si può mettere un qr che apre direttamente il menu",
        " e magari ai tavoli un qr che apre subito il menu",
        ", con anche un qr per i tavoli che porta dritto al menu",
      ],
      variant,
      0,
    );
  // "crearne uno" only fits a venue that has no site at all.
  const cta = pick(
    [
      ["no_website", "social_only"].includes(context.reasonKind)
        ? "vi potrebbe interessare crearne uno apposta?"
        : "vi potrebbe interessare?",
      "vi interesserebbe?",
      "che ne pensate?",
      "vi potrebbe interessare una cosa del genere?",
      "potrebbe interessarvi?",
    ],
    variant,
    3,
  );
  return [
    senderIntro(l, p, variant),
    pick(selected.observations, variant, 0),
    why,
    withPreview(pitch, l),
    cta,
  ].join("\n");
}
const reasonPatterns: Record<ContactReasonKind, RegExp> = {
  no_website:
    /(?=[\s\S]*sito)(?=[\s\S]*(?:non ho trovato|non sono riuscito|non ne ho trovato|non l.ho trovato|senza riuscire a trovarlo))/i,
  broken_website:
    /sito[\s\S]{0,120}(?:non funzion|non si apre|problema nell.aprir)/i,
  poor_website: /sito[\s\S]{0,150}(?:modern|curat|aspetto|grafica|telefono)/i,
  sparse_website:
    /sito[\s\S]{0,150}(?:poco dentro|pochi contenut|scarno|pochissim)/i,
  menu_ads: /menu[\s\S]{0,120}(?:pubblicit|annunci|blocchi pubblicitari)/i,
  instagram_menu_only: /menu[\s\S]{0,120}(?:instagram|storie)/i,
  good_socials_bad_web:
    /(?:pagina|foto|social)[\s\S]{0,150}(?:curat|foto sono)[\s\S]{0,150}(?:sito|menu)/i,
  social_only:
    /sito[\s\S]{0,120}(?:facebook|instagram|tiktok|linktree|piattaforma esterna|pagina social)/i,
  portal_only:
    /sito[\s\S]{0,160}(?:booking|airbnb|vrbo|expedia|hotels\.com|agoda|tripadvisor|subito\.it|casevacanza\.it)|(?:booking|airbnb|vrbo|expedia|hotels\.com|agoda|tripadvisor|subito\.it|casevacanza\.it)[\s\S]{0,160}sito/i,
  events_no_website: /(?:serat|event)[\s\S]{0,170}(?:social|sito|spazio)/i,
};
// Every rule the message breaks, in words the model can act on when it retries.
export function messageProblems(
  raw: string,
  lead: Lead,
  prefs: Preferences,
): string[] {
  const full = raw.trim();
  // The preview link is checked on its own and left out of every other check.
  const urls = (full.match(/https?:\/\/\S+/g) || []).map((u) =>
    u.replace(/[.,;:!?)]+$/, ""),
  );
  const text = full.replace(/https?:\/\/\S+/g, "");
  const trimmed = text.trim();
  const facts = messageFacts(lead, prefs);
  const context = buildOutreachContext(lead, prefs);
  if (context.status !== "ready" || !context.reasonKind)
    return ["Nessun motivo verificato per contattare questo locale"];
  const problems: string[] = [];
  const fail = (condition: boolean, problem: string) => {
    if (condition) problems.push(problem);
  };
  const link = previewLink(lead);
  fail(
    !!link && urls.filter((u) => u === link).length !== 1,
    "Inserisci il link dell'anteprima una sola volta, così com'è",
  );
  fail(
    urls.some((u) => u !== link),
    link
      ? "Usa solo il link dell'anteprima, nessun altro link"
      : "Non inserire link: questo lead non ha un'anteprima",
  );
  fail(
    !!link &&
      full.includes(link) &&
      /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}⃣][️‍]*\s*$/u.test(
        full.slice(0, full.indexOf(link)),
      ),
    "Niente emoji subito prima del link",
  );
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("it")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const normalizedName = normalize(lead.name);
  fail(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      trimmed,
    ) || /\bE\s*\d+\b/i.test(trimmed),
    "Togli codici, ID e riferimenti E1/E2 dal testo",
  );
  fail(
    normalizedName.length >= 3 && normalize(trimmed).includes(normalizedName),
    "Non scrivere il nome del locale nel messaggio",
  );
  // A portal as the website must be named: "sito" plus any listing site is not enough.
  const portal = portalNames.find((name) =>
    context.contactReason.endsWith(`la pagina ${name}`),
  );
  fail(
    portal
      ? !/sito/i.test(trimmed) ||
          !new RegExp(
            `(?<![\\p{L}.])${portal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`,
            "iu",
          ).test(trimmed)
      : !reasonPatterns[context.reasonKind].test(trimmed),
    `Il motivo del contatto deve essere chiaro: ${context.contactReason}`,
  );
  fail(
    facts.unavailable &&
      /restyling|rimettere online|ripristin|sito (?:è )?offline|sito nuovo|sito più bello/i.test(
        text,
      ),
    "Per un sito che non si apre descrivi solo il tentativo di apertura e proponi di sistemarlo",
  );
  fail(!/^ciao\b/i.test(trimmed), "Inizia con Ciao");
  fail(
    /^ciao,?\s*come va|^(?:salve|buongiorno|gentile)\b/i.test(trimmed),
    "Apertura non consentita",
  );
  const banned = trimmed.match(
    /nella scheda Google non è indicato un sito|non risulta (?:un )?sito(?: web)?|il sito non è presente nella scheda|sito semplice|sito base|pagina semplice|recension|stelle su google|rating|segno che|considerat|apprezzat|reputazion|punto di riferimento|valorizzare|presenza online|esperienza digitale|\bsoluzione\b|opportunità|\bclientela\b|\bprofessionale\b|ottimizzare|senza impegno|con calma|rendere tutto più comodo|val(?:e|ere) la pena|potrebbe essere (?:comodo|utile)|avere un posto dove|gentile attività|le scrivo per proporle|leader nel settore|soluzioni digitali|potenziare.*business|massimizzare|incrementare.*presenza online|vi scrivo per il vostro sito|posso aiutarvi ad aggiornarlo|potrebbe servirvi un sito|darvi una mano col sito/i,
  );
  fail(!!banned, `Espressione vietata: "${banned?.[0]}"`);
  // Direct booking is the point of a site for lodging, never for food venues.
  fail(
    sectorOf(lead.category) !== "alloggi" && /prenotazion/i.test(trimmed),
    'Espressione vietata: "prenotazion"',
  );
  fail(
    /commission[^\n]{0,60}\d|\d[^\n]{0,30}commission|commission[^\n]{0,60}per ?cento/i.test(
      trimmed,
    ),
    "Non dare cifre o percentuali sulle commissioni",
  );
  // Lengths ignore the link: it is not the message's own words.
  const lines = trimmed.split(/\n/).filter((line) => line.trim());
  fail(
    lines.length < 3 || lines.length > 7,
    "Scrivi 4 o 5 righe separate da un a capo",
  );
  fail(
    lines.some((line) => line.length > 300),
    "Righe troppo lunghe: spezzale con un a capo",
  );
  fail(
    trimmed.length < 280 || trimmed.length > 950,
    "Lunghezza fuori misura: circa 400–750 caratteri",
  );
  // A short personal introduction: first name only, never a company pitch.
  const name = prefs.sender_name.trim();
  fail(
    !!name &&
      !new RegExp(
        `(?:mi chiamo|sono) ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(lines.slice(0, 2).join(" ")),
    `Presentati all'inizio con "mi chiamo ${name}"`,
  );
  fail(!/google/i.test(trimmed), "Di' che hai cercato il locale su Google");
  // Why a site helps is asked in the prompt but not matched on wording:
  // requiring fixed phrases made every AI draft repeat the same sentence.
  fail(
    /\d+\s?%|raddoppi|triplic|garantit/i.test(trimmed),
    "Non promettere numeri o risultati garantiti",
  );
  fail(
    !/come (?:lo |la |li )?(?:volete|preferite)|come piace a voi|su misura|personalizzat|vostri colori|vostro stile/i.test(
      trimmed,
    ),
    "Di' che il sito è fatto su misura per loro",
  );
  // Self-editing the menu is not part of the offer.
  fail(
    /aggiornabil|in autonomia|(?:aggiorn|modific|gestir|cambiar)\w*[^\n]{0,40}da soli/i.test(
      trimmed,
    ),
    'Non dire che il menu lo aggiornano da soli e non usare "aggiornabile"',
  );
  fail(
    !/(realizzo|mi occupo|faccio|creo|costruisco|sviluppo)/i.test(text) ||
      !/sit[oi]/i.test(text),
    "Di' che fai siti per locali",
  );
  // A smile after the question mark is still a question.
  fail(
    !/\?[\s\p{Extended_Pictographic}️]*$/u.test(trimmed),
    "Chiudi con una domanda semplice",
  );
  fail(
    /ti va di parlarne|se vi va ne parliamo|possiamo sentirci|resto a disposizione/i.test(
      trimmed,
    ),
    "Chiusura non consentita",
  );
  // Light, casual punctuation: a few commas, at most two full stops inside.
  fail(
    (trimmed.match(/,/g) || []).length > 10 ||
      (trimmed.match(/\.(?!\s*$)/gm) || []).length > 2,
    "Troppa punteggiatura: meno virgole e punti",
  );
  fail(/[;:]/.test(trimmed), "Non usare punto e virgola o due punti");
  fail(
    (trimmed.match(/\p{Extended_Pictographic}/gu) || []).length > 2,
    "Al massimo due emoji",
  );
  // One "ciao buongiorno!" is how the sender writes; a shouty draft is not.
  fail(
    (trimmed.match(/!/g) || []).length > 1,
    "Al massimo un punto esclamativo, nel saluto",
  );
  fail(
    !lead.analysis.evidence.some(
      (e) => e.kind === "curated_social" && e.confidence >= 0.7,
    ) &&
      /(?:foto|immagini).{0,25}(?:belle|curate|splendide|ottime)|(?:belle|curate|splendide|ottime).{0,15}(?:foto|immagini)/i.test(
        text,
      ),
    "Non fare complimenti sulle foto: non sono verificati",
  );
  fail(
    !facts.missing &&
      !facts.listingMissing &&
      /non (?:ho )?trovato.*sito|non avete.*sito|senza (?:un )?sito|non (?:risulta|esiste).*sito/i.test(
        text,
      ),
    "Il locale ha un sito: non dire che manca",
  );
  fail(
    !facts.events &&
      /eventi|serate|dj set|karaoke|live music|party/i.test(text),
    "Non citare eventi o serate",
  );
  fail(
    !prefs.free_demo && /demo|gratuit|senza costo/i.test(text),
    "Non offrire demo o lavoro gratuito",
  );
  fail(!facts.qr && /\bqr\b/i.test(text), "Non citare il QR");
  fail(
    !localClaims(lead, prefs) &&
      /della zona|in zona|abito|qui vicino|vicino a voi|non lontano|da queste parti/i.test(
        text,
      ),
    prefs.local
      ? "Il locale è lontano da dove abiti: non dire dove abiti, che sei vicino o della zona"
      : "Non dire dove abiti o che sei della zona",
  );
  fail(
    !facts.unavailable &&
      lead.website_status === "own_website" &&
      ["good", "average", "poor"].includes(lead.website_quality) &&
      (!/restyling|miglior|rived|aggiorn|modern|curat|sistem|rifar|complet/i.test(
        text,
      ) ||
        /non avete.*sito|senza (?:un )?sito|sito nuovo/i.test(text)),
    "Il locale ha già un sito: proponi di migliorarlo, non di farne uno da zero",
  );
  fail(!prefs.restyling && /restyling/i.test(text), 'Non usare "restyling"');
  fail(
    !facts.ads && /pubblicità|annunci pubblicitari/i.test(text),
    "Non citare pubblicità",
  );
  fail(
    !/(menu|drink list|prodotti|foto|contatti|qr|modern|curat|contenut|grafica|navigazione|telefono|informazioni|eventi|serate|prossime date|sistem|rifar)/i.test(
      trimmed,
    ),
    "Proponi qualcosa di concreto: menu, foto, contatti o grafica",
  );
  return problems;
}
export const messageAllowed = (text: string, lead: Lead, prefs: Preferences) =>
  messageProblems(text, lead, prefs).length === 0;
