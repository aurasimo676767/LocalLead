import "server-only";
import { demoLeads } from "../../demo";
import { newLead, now, uid, type Lead } from "../../model";
import { dedupKeys, isLandlinePhone, normalizePhone, safeUrl } from "../../utils";
import { providerJson } from "../http";
export type SearchInput = {
  city: string;
  categories: Lead["category"][];
  limit: number;
  // Dedup keys of places already found or removed: skipped while paging.
  known?: Set<string>;
  onSkip?: () => void;
};
// Extra phrasings reach places beyond the 60 results of a single query.
const queryVariants: Record<Lead["category"], string[]> = {
  Pizzeria: ["pizzeria", "pizza da asporto", "pizzeria forno a legna"],
  Panineria: ["panineria", "paninoteca", "hamburgeria"],
  Ristorante: ["ristorante", "trattoria", "osteria"],
  Bar: ["bar", "caffetteria", "bar colazioni"],
  Pub: ["pub", "birreria"],
  "Cocktail bar": ["cocktail bar", "wine bar", "lounge bar"],
  Pasticceria: ["pasticceria", "pasticceria artigianale"],
  Gelateria: ["gelateria", "gelateria artigianale"],
  Panificio: ["panificio", "forno pane"],
  Gastronomia: ["gastronomia", "salumeria"],
  Rosticceria: ["rosticceria", "tavola calda"],
  "Altro food": ["street food", "cibo da asporto"],
};
const isKnown = (lead: Lead, known?: Set<string>) =>
  !!known && dedupKeys(lead).some((key) => known.has(key));
export interface LocalBusinessProvider {
  searchBusinesses(input: SearchInput): Promise<Lead[]>;
  getBusinessDetails(placeId: string): Promise<Lead>;
}
type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; types: string[] }[];
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: { weekdayDescriptions: string[] };
  businessStatus?: string;
  types?: string[];
};
const mask =
  "id,displayName,formattedAddress,addressComponents,internationalPhoneNumber,websiteUri,rating,userRatingCount,googleMapsUri,location,regularOpeningHours,businessStatus,types";
export class GooglePlacesProvider implements LocalBusinessProvider {
  private headers(prefix = "") {
    return {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask":
        mask
          .split(",")
          .map((f) => prefix + f)
          .join(",") + (prefix ? ",nextPageToken" : ""),
    };
  }
  private map(p: Place, category: Lead["category"], city: string) {
    const l = newLead({
      name: p.displayName?.text || "Attività senza nome",
      city:
        p.addressComponents?.find((c) => c.types?.includes("locality"))
          ?.longText || city,
      category,
      address: p.formattedAddress || "",
      postal_code:
        p.addressComponents?.find((c) => c.types?.includes("postal_code"))
          ?.longText || "",
      phone: normalizePhone(p.internationalPhoneNumber || ""),
      website_url: safeUrl(p.websiteUri || ""),
      maps_url: safeUrl(p.googleMapsUri || ""),
      place_id: p.id,
      rating: p.rating ?? null,
      reviews_count: p.userRatingCount || 0,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      opening_hours: p.regularOpeningHours?.weekdayDescriptions || [],
    });
    l.whatsapp_confidence = l.phone ? "uncertain" : "not_available";
    l.analysis.permanently_closed = p.businessStatus === "CLOSED_PERMANENTLY";
    const source =
      l.maps_url ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.name)}&query_place_id=${encodeURIComponent(p.id)}`;
    if (!l.website_url)
      l.analysis.evidence.push({
        id: uid(),
        kind: "website_missing",
        text: "Google Places non ha restituito un sito proprietario: verifica manualmente prima di concludere che manchi",
        url: source,
        confidence: 0.8,
      });
    l.sources.push({
      id: uid(),
      source_type: "google_places",
      url: source,
      confidence: 0.95,
      metadata_json: {
        place_id: p.id,
        attribution: "Google Maps",
        fetched_at: now(),
        types: p.types || [],
      },
      created_at: now(),
    });
    if (l.reviews_count >= 50)
      l.analysis.evidence.push({
        id: uid(),
        kind: "reviews",
        text: `${l.reviews_count} recensioni su Google Maps`,
        url: source,
        confidence: 0.95,
      });
    if (l.analysis.permanently_closed)
      l.analysis.evidence.push({
        id: uid(),
        kind: "closed",
        text: "Google Places: CLOSED_PERMANENTLY",
        url: source,
        confidence: 0.95,
      });
    if (
      p.types?.length &&
      !p.types.some((t) =>
        /restaurant|food|bakery|bar$|cafe|coffee|pub|pizza|ice_cream|sandwich|meal|pastry|confectionery/.test(
          t,
        ),
      )
    )
      l.analysis.evidence.push({
        id: uid(),
        kind: "out_of_target",
        text: `Categorie Google non food: ${p.types.join(", ")}`,
        url: source,
        confidence: 0.9,
      });
    return l;
  }
  async searchBusinesses(input: SearchInput) {
    const found: Lead[] = [];
    const seen = new Set<string>();
    const started = Date.now();
    const budget = () => Date.now() - started < 25000;
    let partial = false;
    // Allocate a quota per category, with a hard time/page budget for serverless requests.
    const quota = Math.ceil(input.limit / input.categories.length);
    for (const category of input.categories) {
      let count = 0;
      for (const phrase of queryVariants[category]) {
        let token: string | undefined;
        let pages = 0;
        do {
          if (!budget()) {
            partial = true;
            break;
          }
          const json = (await providerJson(
            "https://places.googleapis.com/v1/places:searchText",
            {
              method: "POST",
              headers: this.headers("places."),
              body: JSON.stringify({
                textQuery: `${phrase} a ${input.city}`,
                languageCode: "it",
                regionCode: "IT",
                pageSize: 20,
                ...(token ? { pageToken: token } : {}),
              }),
            },
          )) as { places?: Place[]; nextPageToken?: string };
          for (const p of json?.places || []) {
            if (seen.has(p.id) || count >= quota) continue;
            seen.add(p.id);
            if (
              !normalizePhone(p.internationalPhoneNumber || "") ||
              isLandlinePhone(p.internationalPhoneNumber || "")
            )
              continue;
            const lead = this.map(p, category, input.city);
            if (isKnown(lead, input.known)) {
              input.onSkip?.();
              continue;
            }
            found.push(lead);
            count++;
          }
          token = json?.nextPageToken;
          pages++;
        } while (token && count < quota && pages < 3);
        if (count >= quota || partial) break;
      }
      if (found.length >= input.limit || partial) break;
    }
    if (partial)
      for (const l of found)
        l.analysis.warnings.push(
          "Ricerca parziale per limite di tempo: ripeti con meno categorie",
        );
    console.info("[discovery] Google Places", { count: found.length, partial });
    return found.slice(0, input.limit);
  }
  async getBusinessDetails(placeId: string) {
    const p = (await providerJson(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=it`,
      { headers: this.headers() },
    )) as Place;
    return this.map(p, "Altro food", "");
  }
}
export class DemoPlacesProvider implements LocalBusinessProvider {
  async searchBusinesses(input: SearchInput) {
    const fresh = [];
    for (const l of demoLeads()
      .filter((l) => normalizePhone(l.phone))
      .filter((l) => input.categories.includes(l.category)))
      if (isKnown(l, input.known)) input.onSkip?.();
      else fresh.push(l);
    return fresh.slice(0, input.limit);
  }
  async getBusinessDetails(id: string) {
    const l = demoLeads().find((l) => l.place_id === id);
    if (!l) throw new Error("Lead demo non trovato");
    return l;
  }
}
export const placesProvider = (): LocalBusinessProvider =>
  process.env.GOOGLE_PLACES_API_KEY
    ? new GooglePlacesProvider()
    : new DemoPlacesProvider();
