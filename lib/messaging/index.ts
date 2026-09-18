import { contactable, type Lead, type Preferences } from "../model";
import { websiteFailureEvidence } from "../website-evidence";
export type ContactReasonKind =
  | "no_website"
  | "broken_website"
  | "poor_website"
  | "sparse_website"
  | "menu_ads"
  | "instagram_menu_only"
  | "good_socials_bad_web"
  | "events_no_website";
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
    events: p.events && l.analysis.events_relevant && has("events"),
    products,
    drinks: ["Pub", "Cocktail bar"].includes(l.category),
    qr: p.qr && !products,
  };
}

export function buildOutreachContext(
  lead: Lead,
  prefs: Preferences,
): OutreachContext {
  const evidence = lead.analysis.evidence.filter(
    (e) => e.confidence >= 0.7 && !!e.url,
  );
  const first = (kind: string) => evidence.find((e) => e.kind === kind);
  const unavailable = websiteFailureEvidence(lead);
  const ads = first("menu_ads");
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
    prefs.events && lead.analysis.events_relevant ? first("events") : undefined;
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
  } else if (lead.menu_status === "instagram_only" && menuSource) {
    reasonKind = "instagram_menu_only";
    contactReason = "il menu è disponibile principalmente tramite Instagram";
    chosen.push({
      id: menuSource.id,
      text: "Menu pubblicato tramite Instagram",
      url: menuSource.url,
      confidence: menuSource.confidence,
    });
  } else if (noWebsite) {
    reasonKind = "no_website";
    contactReason =
      "cercando su Google non ho trovato un sito ufficiale del locale";
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
  const menuFeature =
    lead.category === "Cocktail bar" || lead.category === "Pub"
      ? "drink list"
      : [
            "Panificio",
            "Pasticceria",
            "Gastronomia",
            "Gelateria",
            "Rosticceria",
            "Altro food",
          ].includes(lead.category)
        ? "prodotti foto e contatti"
        : "menu";
  const suggestedFeatures = [menuFeature, "foto e contatti"];
  if (
    prefs.qr &&
    ![
      "Panificio",
      "Pasticceria",
      "Gastronomia",
      "Gelateria",
      "Rosticceria",
      "Altro food",
    ].includes(lead.category)
  )
    suggestedFeatures.push("QR code");
  if (reasonKind === "events_no_website")
    suggestedFeatures.unshift("spazio per serate ed eventi");
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
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("it")
    .trim();
// First name only, plus where the sender lives when the "local" preference is on.
export function senderIntro(l: Lead, p: Preferences, variant = 0) {
  const greeting = p.tone === "molto casual" ? "ciao" : "Ciao";
  const name = p.sender_name.trim();
  const city = p.sender_city.trim();
  if (!name) return greeting;
  const home = !p.local || !city
    ? ""
    : normalizePlace(l.city) === normalizePlace(city)
      ? ` e abito anche io a ${city}`
      : ` e abito a ${city}${[" qui vicino a voi", " non lontano da voi", ""][variant % 3]}`;
  return `${greeting}, mi chiamo ${name}${home}`;
}
export function fallbackMessage(l: Lead, p: Preferences, index = 0) {
  if (!contactable(l)) return "";
  const context = buildOutreachContext(l, p);
  if (context.status !== "ready" || !context.reasonKind) return "";
  const variant = ((index % 15) + 15) % 15;
  const body = variant % 3;
  const isProduct = productCategories.includes(l.category);
  const menu = ["Pub", "Cocktail bar"].includes(l.category)
    ? "menu drink"
    : l.category === "Panificio"
      ? "prodotti"
      : "menu";
  const theMenu = menu === "prodotti" ? "i prodotti" : `il ${menu}`;
  const toMenu = menu === "prodotti" ? "ai prodotti" : `al ${menu}`;
  const qr = p.qr && !isProduct;
  const local = p.local ? " della zona" : "";
  const google = [
    "Ho visto il vostro locale su Google e",
    "Vi ho trovati su Google e",
    "Cercando su Google ho trovato il vostro locale e",
  ][body];
  const unsure = context.contactReason.includes("non so")
    ? " e non so se ne avete già uno"
    : "";
  const copy: Record<
    ContactReasonKind,
    { observations: string[]; pitches: string[] }
  > = {
    no_website: {
      observations: [
        `ho cercato il vostro sito ma non sono riuscito a trovarlo${unsure}`,
        `stavo cercando il vostro sito ma non ne ho trovato uno${unsure}`,
        `un vostro sito però non l'ho trovato${unsure}`,
      ],
      pitches: [
        `Il sito lo costruiamo insieme come lo volete voi con i vostri colori e le vostre foto e dentro ci mettiamo ${theMenu}`,
        `Potrei creare un sito completamente su misura per voi, dalla grafica ${toMenu}`,
        `Potrei farvene uno tutto vostro e personalizzato sul vostro stile con ${theMenu} e i contatti`,
      ],
    },
    broken_website: {
      observations: [
        "ho provato ad aprire il vostro sito ma al momento non si apre",
        "ho provato ad aprire anche il vostro sito ma sembra che al momento non funzioni",
        "stavo guardando il sito ma sembra esserci un problema nell'aprirlo",
      ],
      pitches: [
        `Ve lo potrei sistemare come piace a voi mantenendo le informazioni che avete già e mettendo bene in vista ${theMenu}`,
        `Potrei rifarlo su misura per voi, dalla grafica ${toMenu} senza perdere i contenuti che avete già`,
        `Si potrebbe sistemare e renderlo davvero vostro con i vostri colori e ${theMenu} sempre in vista`,
      ],
    },
    poor_website: {
      observations: [
        "ho dato un'occhiata al sito e secondo me si potrebbe rendere parecchio più moderno",
        "stavo guardando il vostro sito e l'aspetto si potrebbe curare molto meglio",
        "poi ho aperto il sito e secondo me la grafica si potrebbe aggiornare",
      ],
      pitches: [
        `Potrei rifarlo su misura per voi con i vostri colori mantenendo ${theMenu} e le informazioni che avete già`,
        "Si potrebbe sistemare grafica e navigazione come piace a voi senza stravolgere tutto",
        "Potrei renderlo più curato e comodo dal telefono, completamente personalizzato sul vostro stile",
      ],
    },
    sparse_website: {
      observations: [
        "poi ho aperto il sito ed è un peccato che ci sia così poco dentro",
        "stavo guardando il vostro sito e ci sono davvero pochi contenuti sull'attività",
        "ho dato un'occhiata al sito e al momento è molto scarno",
      ],
      pitches: [
        `Potrei completarlo come piace a voi con ${theMenu} e le foto tutti in un posto`,
        "Si potrebbe aggiungere quello che manca e renderlo su misura per voi con i vostri colori e le vostre foto",
        `Potrei sistemare contenuti e ${menu} su misura per voi senza stravolgere il sito`,
      ],
    },
    menu_ads: {
      observations: [
        "ho aperto il menu online ma c'è parecchia pubblicità intorno",
        "ho aperto il vostro menu ma gli annunci lo rendono poco pulito",
        "ho visto che il menu online è su una piattaforma piena di pubblicità",
      ],
      pitches: [
        `Potrei mettere ${theMenu} su un sito tutto vostro, pulito e personalizzato come piace a voi`,
        "Si potrebbe avere un menu vostro senza annunci e fatto su misura con i vostri colori",
        `Potrei creare un sito come lo volete voi con ${theMenu} senza quella pubblicità`,
      ],
    },
    instagram_menu_only: {
      observations: [
        "il menu si trova principalmente su Instagram",
        "cercando il menu ho trovato il link su Instagram",
        "poi ho visto il link al menu su Instagram",
      ],
      pitches: [
        `Potrei mettere ${theMenu} su un sito tutto vostro fatto su misura con i vostri colori e le vostre foto`,
        `Si potrebbe avere ${theMenu} in un sito vostro personalizzato come piace a voi e più rapido da aprire`,
        `Potrei creare un sito come lo volete voi con ${theMenu} e le foto del locale`,
      ],
    },
    good_socials_bad_web: {
      observations: [
        "poi ho guardato la vostra pagina e le foto sono curate ma il sito non è allo stesso livello",
        "ho visto che sui social curate bene le foto mentre il sito resta molto più scarno",
        "la vostra pagina è curata ma il sito stona un po' col resto",
      ],
      pitches: [
        `Potrei rifare il sito su misura con lo stesso stile delle vostre foto e una parte dedicata ${toMenu}`,
        "Si potrebbe creare qualcosa di molto più curato e personalizzato come piace a voi",
        `Potrei rendere il sito coerente con la pagina e con i vostri colori sistemando anche ${theMenu}`,
      ],
    },
    events_no_website: {
      observations: [
        "da quello che vedo organizzate serate ma non ho trovato un vostro sito dove raccoglierle",
        "stavo guardando le vostre serate ma non ho trovato un sito dove vederle tutte",
        "ho visto gli eventi che organizzate ma non ho trovato un sito del locale",
      ],
      pitches: [
        `Potrei farvi un sito su misura per le prossime date con ${theMenu} e i contatti`,
        "Si potrebbero raccogliere serate e prossime date in un sito vostro fatto come piace a voi",
        `Potrei creare uno spazio per gli eventi personalizzato sul vostro stile con ${theMenu}`,
      ],
    },
  };
  const selected = copy[context.reasonKind];
  // Why a site matters, in plain words and without promising numbers.
  const why = [
    `Io faccio siti per locali${local} e oggi tanta gente prima di uscire cerca tutto dal telefono, se trova subito ${theMenu} e le foto in un sito curato è molto più facile che scelga voi`,
    `Mi occupo proprio di siti per locali${local}. Ormai quasi tutti prima di scegliere dove andare guardano dal telefono e un sito curato con ${theMenu} e le foto fa davvero la differenza anche sulle vendite`,
    `Creo siti per locali${local} e vi dico la verità, chi vi cerca dal telefono vuole vedere subito ${theMenu} e qualche foto in un sito curato e quando li trova è molto più propenso a passare da voi`,
  ][body];
  let pitch = selected.pitches[body];
  if (qr && !/qr/i.test(pitch))
    pitch += ", poi ai tavoli si può mettere un QR che apre direttamente il menu";
  const ctas = [
    "Vi interesserebbe?",
    "Potrebbe interessarvi?",
    "Che ne pensate?",
    "Può interessarvi?",
    "Vi potrebbe interessare una cosa del genere?",
  ];
  return [
    senderIntro(l, p, body),
    `${google} ${selected.observations[body]}`,
    why,
    pitch,
    ctas[variant % ctas.length],
  ].join("\n");
}
export function messageAllowed(text: string, lead: Lead, prefs: Preferences) {
  const trimmed = text.trim();
  const facts = messageFacts(lead, prefs);
  const context = buildOutreachContext(lead, prefs);
  if (context.status !== "ready" || !context.reasonKind) return false;
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("it")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const normalizedText = normalize(trimmed);
  const normalizedName = normalize(lead.name);
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      trimmed,
    ) ||
    /\bE\s*\d+\b/i.test(trimmed) ||
    (normalizedName.length >= 3 && normalizedText.includes(normalizedName))
  )
    return false;
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
    events_no_website: /(?:serat|event)[\s\S]{0,170}(?:social|sito|spazio)/i,
  };
  if (!reasonPatterns[context.reasonKind].test(trimmed)) return false;
  if (
    facts.unavailable &&
    /restyling|rimettere online|ripristin|sito (?:è )?offline|sito nuovo|sito più bello/i.test(
      text,
    )
  )
    return false;
  if (!/^ciao\b/i.test(trimmed)) return false;
  if (/^ciao,?\s*come va|^(?:salve|buongiorno|gentile)\b/i.test(trimmed))
    return false;
  if (
    /nella scheda Google non è indicato un sito|non risulta (?:un )?sito(?: web)?|il sito non è presente nella scheda|sito semplice|sito base|pagina semplice|recension|stelle su google|rating|segno che|considerat|apprezzat|reputazion|punto di riferimento|valorizzare|presenza online|esperienza digitale|\bsoluzione\b|opportunità|\bclientela\b|\bprofessionale\b|ottimizzare|senza impegno|con calma|rendere tutto più comodo|val(?:e|ere) la pena|potrebbe essere (?:comodo|utile)|avere un posto dove|magari con/i.test(
      trimmed,
    )
  )
    return false;
  const lines = trimmed.split(/\n/).filter((line) => line.trim());
  if (
    lines.length < 4 ||
    lines.length > 6 ||
    lines.some((line) => line.length > 260)
  )
    return false;
  // A short personal introduction: first name only, never a company pitch.
  const name = prefs.sender_name.trim();
  if (
    name &&
    !new RegExp(
      `(?:mi chiamo|sono) ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    ).test(lines.slice(0, 2).join(" "))
  )
    return false;
  if (!/su google/i.test(trimmed)) return false;
  // Why a site sells, without promising numbers.
  if (
    !/più facile che|fa (?:davvero )?la differenza|vendit|più propens|scelga voi|scelgano voi|passare da voi|venire da voi/i.test(
      trimmed,
    ) ||
    /\d+\s?%|raddoppi|triplic|garantit/i.test(trimmed)
  )
    return false;
  if (
    !/come (?:lo |la |li )?(?:volete|preferite)|come piace a voi|su misura|personalizzat|vostri colori|vostro stile/i.test(
      trimmed,
    )
  )
    return false;
  // Self-editing the menu is not part of the offer.
  if (
    /aggiornabil|in autonomia|(?:aggiorn|modific|gestir|cambiar)\w*[^\n]{0,40}da soli/i.test(
      trimmed,
    )
  )
    return false;
  if (
    !/(realizzo|mi occupo|faccio|creo|costruisco|sviluppo)/i.test(text) ||
    !/sit[oi]/i.test(text)
  )
    return false;
  if (
    !/(vi interesserebbe|potrebbe interessarvi|che ne pensate|può interessarvi|vi potrebbe interessare una cosa del genere)\?$/i.test(
      trimmed,
    )
  )
    return false;
  if (
    /ti va di parlarne|se vi va ne parliamo|possiamo sentirci|resto a disposizione|senza impegno/i.test(
      trimmed,
    )
  )
    return false;
  // Light, casual punctuation: a few commas, at most one full stop inside.
  if (
    (trimmed.match(/,/g) || []).length > 5 ||
    (trimmed.match(/\.(?!\s*$)/gm) || []).length > 1 ||
    /[;:]/.test(trimmed)
  )
    return false;
  if (
    !lead.analysis.evidence.some(
      (e) => e.kind === "curated_social" && e.confidence >= 0.7,
    ) &&
    /(?:foto|immagini).{0,25}(?:belle|curate|splendide|ottime)|(?:belle|curate|splendide|ottime).{0,15}(?:foto|immagini)/i.test(
      text,
    )
  )
    return false;
  if (
    !facts.missing &&
    !facts.listingMissing &&
    /non (?:ho )?trovato.*sito|non avete.*sito|senza (?:un )?sito|non (?:risulta|esiste).*sito/i.test(
      text,
    )
  )
    return false;
  if (
    text.length < 300 ||
    text.length > 900 ||
    // Emoji arrive as "\uFFFD" in WhatsApp drafts.
    /\p{Extended_Pictographic}/u.test(text) ||
    /prenotazion|gentile attività|le scrivo per proporle|leader nel settore|soluzioni digitali|potenziare.*business|massimizzare|incrementare.*presenza online|!/iu.test(
      text,
    )
  )
    return false;
  if (
    !facts.events &&
    /eventi|serate|dj set|karaoke|live music|party/i.test(text)
  )
    return false;
  if (!prefs.free_demo && /demo|gratuit|senza costo/i.test(text)) return false;
  if (!facts.qr && /\bqr\b/i.test(text)) return false;
  if (!prefs.local && /della zona|abito|qui vicino|non lontano/i.test(text))
    return false;
  if (
    !facts.unavailable &&
    lead.website_status === "own_website" &&
    ["good", "average", "poor"].includes(lead.website_quality) &&
    (!/restyling|miglior|rived|aggiorn|modern|curat|sistem|rifar|complet/i.test(
      text,
    ) ||
      /non avete.*sito|senza (?:un )?sito|sito nuovo/i.test(text))
  )
    return false;
  if (!prefs.restyling && /restyling/i.test(text)) return false;
  if (!facts.ads && /pubblicità|annunci pubblicitari/i.test(text)) return false;
  if (
    /vi scrivo per il vostro sito|posso aiutarvi ad aggiornarlo|potrebbe servirvi un sito|darvi una mano col sito/i.test(
      trimmed,
    )
  )
    return false;
  if (
    !/(menu|drink list|prodotti|foto|contatti|qr|modern|curat|contenut|grafica|navigazione|telefono|informazioni|annunci|pubblicit|eventi|serate|prossime date|sistem|rifar)/i.test(
      lines.slice(-2, -1).join(" "),
    )
  )
    return false;
  return true;
}
