import type { Lead, Preferences } from "../model";
import { worthwhile } from "../scoring";
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
  if (!worthwhile(l)) return "";
  const own = ["own_website", "broken"].includes(l.website_status);
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
    "ciao",
    "ciao, una cosa al volo",
    "ciao, sono capitato sulla vostra pagina",
    "ciao, stavo dando un’occhiata",
  ];
  const ctas = [
    "se vi va ne possiamo parlare",
    "se può interessarvi ci sentiamo",
    "volevo capire se poteva interessarvi",
    "se vi interessa, possiamo sentirci",
  ];
  const evidence = l.analysis.evidence;
  let observation = own
    ? `ho guardato il sito di ${l.name}`
    : `ho visto la pagina di ${l.name}`;
  if (evidence.some((e) => e.kind === "menu_ads" && e.confidence >= 0.7))
    observation += ": nel menu online compaiono elementi pubblicitari";
  else if (own && evidence.some((e) => e.kind === "sparse"))
    observation += ": i contenuti sono piuttosto essenziali";
  else if (l.analysis.events_relevant && p.events)
    observation += ": ho letto delle vostre serate";
  else if (
    !own &&
    evidence.some((e) => e.kind === "no_website" && e.confidence >= 0.7)
  )
    observation +=
      ": dalle informazioni pubblicate non ho trovato un sito vostro";
  else if (
    !own &&
    evidence.some((e) => e.kind === "website_missing" && e.confidence >= 0.7)
  )
    observation +=
      ": Google non mostra un sito proprietario, quindi vale la pena verificarlo";
  let pitch = own
    ? `si potrebbe fare un ${p.restyling ? "restyling" : "miglioramento del sito"} per valorizzare ${products}`
    : `un sito vostro potrebbe raccogliere ${products}`;
  if (
    p.events &&
    l.analysis.events_relevant &&
    !l.analysis.features?.has_events_page
  )
    pitch += " e le prossime serate";
  else if (p.qr && !food && l.menu_status !== "unknown" && index % 2 === 0)
    pitch += ", anche con un QR per il menu";
  const intro =
    p.tone === "neutro"
      ? "buongiorno"
      : p.tone === "molto casual"
        ? starts[index % starts.length]
        : ["ciao", "ciao, vi scrivo perché"][index % 2];
  const identity = `realizzo siti per locali${p.local ? " della zona" : ""}`;
  return `${intro}, ${observation}\n${pitch}\n${identity}, ${ctas[index % ctas.length]}`.replace(
    /,,/g,
    ",",
  );
}
export function messageAllowed(text: string, lead: Lead, prefs: Preferences) {
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
    ["own_website", "broken"].includes(lead.website_status) &&
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
