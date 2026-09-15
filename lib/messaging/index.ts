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
export function fallbackMessage(l: Lead, p: Preferences, index = 0) {
  if (!contactable(l)) return "";
  const evidence = l.analysis.evidence;
  const unavailable =
    l.website_status === "broken" ||
    evidence.some(
      (e) => e.kind === "website_unreachable" && e.confidence >= 0.7,
    );
  const own = l.website_status === "own_website" && !unavailable;
  const food = [
    "Panificio",
    "Pasticceria",
    "Gastronomia",
    "Gelateria",
  ].includes(l.category);
  const products = food
    ? "prodotti, specialità, foto e contatti"
    : ["Pub", "Cocktail bar"].includes(l.category)
      ? "drink list, foto e contatti"
      : "menu, foto e contatti";
  const starts = [
    "ciao, sono capitato sulla vostra pagina e mi è venuta un'idea",
    "ciao, stavo guardando un po' il vostro profilo",
    "ciao, ho visto il vostro menu online",
    "ciao, mi sono fermato a guardare le foto del locale",
  ];
  const ctas = [
    "se vi può servire, ci sentiamo",
    "se vi interessa, ne parliamo",
    "se vi va, ci possiamo sentire",
    "volevo capire se poteva interessarvi",
  ];
  const opening = starts[index % starts.length];
  let observation = opening;
  if (unavailable)
    observation += ": ho provato ad aprire il sito ma al momento non risponde";
  else if (evidence.some((e) => e.kind === "menu_ads" && e.confidence >= 0.7))
    observation +=
      ": ho visto anche il menu online e secondo me la pubblicità intorno lo fa sembrare un po' meno vostro";
  else if (own && evidence.some((e) => e.kind === "sparse"))
    observation +=
      " e il sito mi sembra un po' vuoto rispetto alle cose che fate";
  else if (l.analysis.events_relevant && p.events)
    observation += ", e ho visto che fate anche serate";
  else if (
    !own &&
    evidence.some((e) => e.kind === "no_website" && e.confidence >= 0.7)
  )
    observation +=
      ": tra le informazioni pubblicate non ho trovato un sito vostro";
  else if (
    !own &&
    evidence.some((e) => e.kind === "website_missing" && e.confidence >= 0.7)
  )
    observation += ": su Google non ho visto un sito vostro, solo la scheda";
  else observation += ", e mi è venuta una cosa in mente";
  let pitch = unavailable
    ? "prima di pensare a modifiche bisognerebbe rimetterlo online, poi si può sistemare il resto"
    : own
    ? `secondo me con un ${p.restyling ? "restyling" : "sistemata"} semplice si potrebbe rendere il sito più completo, soprattutto per ${products}`
    : `secondo me per il tipo di locale che avete ci starebbe bene un sito vostro, semplice ma fatto bene, con ${products} tutti nello stesso posto`;
  if (
    p.events &&
    l.analysis.events_relevant &&
    !l.analysis.features?.has_events_page
  )
    pitch += " e le prossime serate";
  else if (p.qr && !food && index % 2 === 0)
    pitch += ", volendo anche con un QR per aprire il menu al tavolo";
  const identity = p.local
    ? "io mi occupo proprio di siti per locali della zona"
    : "io mi occupo proprio di siti per locali";
  return `${observation}.\n\n${pitch}. ${identity}, ${ctas[index % ctas.length]}`.replace(
    /,,/g,
    ",",
  );
}
export function messageAllowed(text: string, lead: Lead, prefs: Preferences) {
  const trimmed = text.trim();
  if (!/^ciao\b/i.test(trimmed)) return false;
  if (/^ciao,?\s*come va|^(?:salve|buongiorno|gentile)\b/i.test(trimmed))
    return false;
  if (
    /punto di riferimento|ottima reputazione|complimenti per le recensioni|valorizzare|presenza online|esperienza digitale|\bsoluzione\b|\bopportunità\b|\bclientela\b|\bprofessionale\b|ottimizzare|senza impegno|con calma|rendere tutto piÃ¹ comodo/i.test(
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
  if (!/(sentir|sentiamo|parlar|interess|se vi va)/i.test(text)) return false;
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
    !lead.analysis.evidence.some(
      (e) =>
        ["no_website", "website_missing"].includes(e.kind) &&
        e.confidence >= 0.7,
    ) &&
    /non (?:ho )?trovato.*sito|non avete.*sito|senza (?:un )?sito/i.test(text)
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
    (!prefs.events || !lead.analysis.events_relevant) &&
    /eventi|serate|dj set|karaoke|live music|party/i.test(text)
  )
    return false;
  if (!prefs.free_demo && /demo|gratuit|senza costo/i.test(text)) return false;
  if (!prefs.qr && /\bqr\b/i.test(text)) return false;
  if (!prefs.local && /della zona/i.test(text)) return false;
  if (
    lead.website_status === "own_website" &&
    ["good", "average", "poor"].includes(lead.website_quality) &&
    (!/restyling|miglior|rived|aggiorn/i.test(text) ||
      /non avete.*sito|senza.*sito|sito nuovo/i.test(text))
  )
    return false;
  if (!prefs.restyling && /restyling/i.test(text)) return false;
  if (
    !lead.analysis.evidence.some((e) => e.kind === "menu_ads") &&
    /pubblicità|annunci pubblicitari/i.test(text)
  )
    return false;
  return true;
}
