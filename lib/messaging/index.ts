import { contactable, type Lead, type Preferences } from "../model";
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
  const unavailable =
    l.website_status === "broken" || has("website_unreachable");
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
  const unavailable = first("website_unreachable");
  const ads = first("menu_ads");
  const sparse = first("sparse");
  const weak = first("weak_website");
  const noWebsite = first("no_website");
  const websiteMissing = first("website_missing");
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
  } else if (curated && (sparse || weak)) {
    reasonKind = "good_socials_bad_web";
    contactReason = sparse
      ? "la pagina e le foto sono curate ma il sito contiene pochissimo materiale"
      : "la pagina e le foto sono curate ma il sito non è allo stesso livello";
    addAttributions(curated, sparse || weak);
  } else if (sparse) {
    reasonKind = "sparse_website";
    contactReason =
      "il sito esiste ma contiene pochissimo materiale rispetto all’attività";
    addAttributions(sparse);
  } else if (weak) {
    reasonKind = "poor_website";
    contactReason = "il sito esiste ma appare poco moderno e poco curato";
    addAttributions(weak);
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
      ? "drink list aggiornabile"
      : [
            "Panificio",
            "Pasticceria",
            "Gastronomia",
            "Gelateria",
            "Rosticceria",
            "Altro food",
          ].includes(lead.category)
        ? "prodotti foto e contatti"
        : "menu aggiornabile";
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

export function fallbackMessage(l: Lead, p: Preferences, index = 0) {
  if (!contactable(l)) return "";
  const context = buildOutreachContext(l, p);
  if (context.status !== "ready" || !context.reasonKind) return "";
  const variant = ((index % 15) + 15) % 15;
  const greeting = p.tone === "molto casual" ? "ciao" : "Ciao";
  const isProduct = [
    "Panificio",
    "Pasticceria",
    "Gastronomia",
    "Gelateria",
    "Rosticceria",
    "Altro food",
  ].includes(l.category);
  const menu = ["Pub", "Cocktail bar"].includes(l.category)
    ? "drink list"
    : isProduct
      ? "prodotti"
      : "menu";
  const contentPackage = isProduct
    ? "prodotti foto e contatti"
    : `${menu} aggiornabile foto e contatti`;
  const updatableMenu = isProduct ? "prodotti e foto" : `${menu} aggiornabile`;
  const qr = p.qr && !isProduct ? " e QR code" : "";
  const local = p.local ? " della zona" : "";
  const noWebsiteObservations = context.contactReason.includes("non so")
    ? [
        "cercando su Google non sono riuscito a trovare un vostro sito e non so se ne avete già uno",
        "ho cercato un sito ufficiale del locale ma non l'ho trovato e non so se ne avete già uno",
        "stavo cercando il vostro sito su Google senza riuscire a trovarlo e non so se esiste già",
      ]
    : [
        "cercando su Google non ho trovato un vostro sito",
        "ho cercato un sito ufficiale del locale ma non sono riuscito a trovarlo",
        "stavo cercando il vostro sito su Google ma non ne ho trovato uno",
      ];
  const copy: Record<
    ContactReasonKind,
    { observations: string[]; pitches: string[] }
  > = {
    no_website: {
      observations: noWebsiteObservations,
      pitches: [
        `potrei farvene uno vostro con ${contentPackage}${qr}`,
        `si potrebbe creare un sito fatto bene con ${menu} foto e contatti${qr}`,
        `potrei realizzare un sito vostro con ${menu} foto e contatti${qr}`,
      ],
    },
    broken_website: {
      observations: [
        "ho trovato il vostro sito ma sembra che al momento non funzioni",
        "ho provato ad aprire il vostro sito ma al momento non si apre",
        "stavo guardando il vostro sito ma sembra esserci un problema nell'aprirlo",
      ],
      pitches: [
        "potrei sistemarlo e renderlo di nuovo comodo da consultare",
        "si potrebbe rimettere a posto mantenendo le informazioni che avete già",
        "potrei rifarlo in modo più stabile e curato senza perdere i contenuti",
      ],
    },
    poor_website: {
      observations: [
        "ho dato un'occhiata al vostro sito e secondo me si potrebbe rendere parecchio più moderno",
        "stavo guardando il vostro sito e l'aspetto si potrebbe curare molto meglio",
        "ho visto il vostro sito e secondo me oggi non rispecchia bene il locale",
      ],
      pitches: [
        `potrei rifarlo mantenendo ${menu} e informazioni che avete già`,
        `si potrebbe sistemare grafica navigazione e ${menu} senza stravolgere tutto`,
        `potrei renderlo più curato e più comodo da usare dal telefono`,
      ],
    },
    sparse_website: {
      observations: [
        "ho visto il vostro sito e secondo me è un peccato che ci sia così poco dentro",
        "stavo guardando il vostro sito e ci sono davvero pochi contenuti sull'attività",
        "ho dato un'occhiata al sito e al momento è molto scarno",
      ],
      pitches: [
        `potrei completarlo con ${menu} foto e contatti tutti in un posto`,
        `si potrebbe aggiungere quello che manca e renderlo molto più curato`,
        `potrei sistemare contenuti foto e ${menu} senza stravolgere il sito`,
      ],
    },
    menu_ads: {
      observations: [
        "stavo guardando il vostro menu online e c'è parecchia pubblicità intorno",
        "ho aperto il vostro menu e gli annunci lo rendono poco pulito",
        "ho visto che il menu online è su una piattaforma piena di pubblicità",
      ],
      pitches: [
        `potrei metterlo su un sito vostro più pulito con ${updatableMenu}${qr}`,
        `si potrebbe avere un menu vostro senza annunci e più comodo da aprire${qr}`,
        `potrei creare un sito curato dove aggiornare ${menu} senza quella pubblicità${qr}`,
      ],
    },
    instagram_menu_only: {
      observations: [
        "ho visto che il vostro menu si trova principalmente su Instagram",
        "stavo cercando il menu e l'ho trovato soprattutto nelle storie di Instagram",
        "ho notato che per vedere il menu bisogna passare da Instagram",
      ],
      pitches: [
        `potrei metterlo su un sito vostro sempre aggiornabile${qr}`,
        `si potrebbe consultare ${menu} in un sito più rapido da aprire${qr}`,
        `potrei creare un sito curato con ${menu} foto e contatti${qr}`,
      ],
    },
    good_socials_bad_web: {
      observations: [
        "stavo guardando la vostra pagina e le foto sono curate ma il sito non è allo stesso livello",
        "ho visto che sui social curate bene le foto mentre il sito resta molto più scarno",
        "la vostra pagina è curata ma il sito e il menu stonano un po' col resto",
      ],
      pitches: [
        `potrei rendere il sito più coerente con le foto e sistemare anche ${menu}`,
        "si potrebbe creare qualcosa di molto più curato mantenendo lo stile della pagina",
        `potrei rifare il sito con lo stesso livello di cura e una parte dedicata a ${menu}`,
      ],
    },
    events_no_website: {
      observations: [
        "ho visto che pubblicate spesso serate ma le informazioni restano sparse sui social",
        "stavo guardando le vostre serate e non ho trovato un sito dove vederle tutte",
        "ho notato che gli eventi vengono pubblicati sui social ma manca uno spazio dedicato",
      ],
      pitches: [
        `potrei farvi un sito per le prossime date con ${menu} e contatti`,
        "si potrebbero raccogliere serate e prossime date in un sito vostro facile da aggiornare",
        `potrei creare uno spazio curato per gli eventi con ${menu} e informazioni del locale`,
      ],
    },
  };
  const selected = copy[context.reasonKind];
  const observation = selected.observations[variant % 3];
  const pitch = selected.pitches[Math.floor(variant / 3) % 3];
  const ctas = [
    "Vi interesserebbe?",
    "Potrebbe interessarvi?",
    "Che ne pensate?",
    "Può interessarvi?",
    "Vi potrebbe interessare una cosa del genere?",
  ];
  const middle = [
    `mi occupo di siti per locali${local} e ${pitch}`,
    `faccio siti per locali${local} e ${pitch}`,
    `creo siti per locali${local} quindi ${pitch}`,
  ][Math.floor(variant / 5) % 3];
  return `${greeting}, ${observation}\n${middle}\n${ctas[variant % ctas.length]}`;
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
    poor_website:
      /sito[\s\S]{0,150}(?:modern|curat|aspetto|rispecchia|telefono)/i,
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
    lines.length < 2 ||
    lines.length > 3 ||
    lines.some((line) => line.length > 220)
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
  if ((trimmed.match(/[,;:]/g) || []).length > 2) return false;
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
    text.length < 140 ||
    text.length > 420 ||
    /prenotazion|gentile attività|le scrivo per proporle|leader nel settore|soluzioni digitali|potenziare.*business|massimizzare|incrementare.*presenza online|!|\p{Extended_Pictographic}/iu.test(
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
  if (!prefs.local && /della zona/i.test(text)) return false;
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
    !/(menu|drink list|prodotti|foto|contatti|qr|modern|curat|contenut|grafica|navigazione|telefono|informazioni|annunci|pubblicit|eventi|serate|prossime date|sistem|rifar|rimettere|aggiornabile)/i.test(
      lines[1],
    )
  )
    return false;
  return true;
}
