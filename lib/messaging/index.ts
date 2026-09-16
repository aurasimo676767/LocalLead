import { contactable, type Lead, type Preferences } from "../model";
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
    ads: has("menu_ads"),
    events: p.events && l.analysis.events_relevant && has("events"),
    products,
    drinks: ["Pub", "Cocktail bar"].includes(l.category),
    qr: p.qr && !products,
  };
}

export function fallbackMessage(l: Lead, p: Preferences, index = 0) {
  if (!contactable(l)) return "";
  const f = messageFacts(l, p);
  const variant = ((index % 12) + 12) % 12;
  const greeting = p.tone === "molto casual" ? "ciao" : "Ciao";
  let observation: string;
  let pitch: string;
  const menu = f.products
    ? "i prodotti"
    : f.drinks
      ? "la drink list"
      : "il menu";
  if (f.unavailable) {
    observation =
      "nel controllo del vostro sito non sono riuscito ad aprirlo. È una cosa temporanea?";
    pitch = "Se vi serve una mano a verificare cosa succede, possiamo parlarne";
  } else if (f.ads) {
    observation = "nel menu online compaiono dei blocchi pubblicitari";
    pitch = f.own
      ? "Si potrebbe aggiornare il sito mettendoci il menu, senza quegli annunci"
      : "Si potrebbe mettere il menu su una pagina vostra, senza quegli annunci";
  } else if (f.own && f.weak) {
    observation = f.sparse
      ? "dalla homepage si leggono poche informazioni sul locale"
      : "vi scrivo per capire se state pensando a qualche aggiornamento del sito";
    pitch = p.restyling
      ? "Si potrebbe fare un piccolo restyling per aggiornare i contenuti"
      : "Si potrebbero aggiornare i contenuti del sito";
  } else if (f.events) {
    observation = "ho visto che organizzate anche serate";
    pitch = f.own
      ? "Si potrebbe aggiornare il sito con le prossime date"
      : "Ci starebbe una pagina con le prossime date e " +
        menu +
        " da aggiornare";
  } else if (f.missing) {
    observation = "ho cercato un sito vostro ma non l'ho trovato";
    pitch =
      "Se vi serve, si può fare una pagina semplice con " +
      menu +
      " che aggiornate voi";
  } else if (f.own) {
    observation =
      "vi scrivo per sapere se state pensando ad aggiornare il vostro sito";
    pitch =
      "Mi occupo di siti per locali" +
      (p.local ? " della zona" : "") +
      " e volevo capire se avete già qualcosa in mente";
  } else {
    observation = f.listingMissing
      ? "nella scheda Google non è indicato un sito. Ne avete già uno dove trovare " +
        menu +
        "?"
      : "avete già un sito dove trovare " +
        menu +
        " e le informazioni del locale?";
    pitch =
      "Mi occupo di siti per locali" +
      (p.local ? " della zona" : "") +
      ": se è una cosa a cui state pensando, possiamo parlarne";
  }
  if (!f.unavailable && (f.missing || f.ads || (f.own && f.weak))) {
    if (f.qr && variant % 2 === 0)
      pitch += ", con un QR per aprire il menu al tavolo";
    else if (f.ads || (f.own && f.weak))
      pitch += ". Potreste aggiornare " + menu + " quando serve";
  }
  const identity =
    "Mi occupo di siti per locali" + (p.local ? " della zona" : "");
  const ctas =
    p.tone === "neutro"
      ? [
          "Vi interessa parlarne?",
          "Se vi interessa, possiamo sentirci.",
          "È qualcosa che state valutando?",
        ]
      : [
          "Vi va di parlarne?",
          "Se vi interessa, ci sentiamo.",
          "Ci possiamo sentire?",
        ];
  const intro =
    greeting + ", " + observation + (/[?.]$/.test(observation) ? "" : ".");
  if (pitch.startsWith("Mi occupo")) return intro + "\n\n" + pitch + ".";
  if (variant % 3 === 1)
    return intro + "\n\n" + identity + ". " + pitch + ". " + ctas[variant % 3];
  return intro + "\n\n" + pitch + ".\n\n" + identity + ". " + ctas[variant % 3];
}
export function messageAllowed(text: string, lead: Lead, prefs: Preferences) {
  const trimmed = text.trim();
  const facts = messageFacts(lead, prefs);
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
  if (
    facts.unavailable &&
    /restyling|rimetter|ripristin|sito (?:è )?offline|sito nuovo|sito più bello/i.test(
      text,
    )
  )
    return false;
  if (!/^ciao\b/i.test(trimmed)) return false;
  if (/^ciao,?\s*come va|^(?:salve|buongiorno|gentile)\b/i.test(trimmed))
    return false;
  if (
    /recension|stelle su google|rating|segno che|considerat|apprezzat|reputazion|punto di riferimento|valorizzare|presenza online|esperienza digitale|\bsoluzione\b|opportunità|\bclientela\b|\bprofessionale\b|ottimizzare|senza impegno|con calma|rendere tutto più comodo|val(?:e|ere) la pena|potrebbe essere (?:comodo|utile)|avere un posto dove|magari con/i.test(
      trimmed,
    )
  )
    return false;
  if (trimmed.split(/\n\s*\n/).filter(Boolean).length > 3) return false;
  if (
    !/(realizzo|mi occupo|faccio|creo|costruisco|sviluppo)/i.test(text) ||
    !/sit[oi]/i.test(text)
  )
    return false;
  if (
    !/(sentir|sentiamo|parlar|interess|se vi va|state valutando|in mente)/i.test(
      text,
    )
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
    /non (?:ho )?trovato.*sito|non avete.*sito|senza (?:un )?sito|non (?:risulta|esiste).*sito/i.test(
      text,
    )
  )
    return false;
  if (
    text.length < 160 ||
    text.length > 500 ||
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
    (!/restyling|miglior|rived|aggiorn/i.test(text) ||
      /non avete.*sito|senza.*sito|sito nuovo/i.test(text))
  )
    return false;
  if (!prefs.restyling && /restyling/i.test(text)) return false;
  if (!facts.ads && /pubblicità|annunci pubblicitari/i.test(text)) return false;
  return true;
}
