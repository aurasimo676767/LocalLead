import {
  newLead,
  now,
  uid,
  defaultPreferences,
  type Lead,
  type Workspace,
} from "./model";
import { scoreLead } from "./scoring";
const specs: Array<
  Partial<Lead> & { name: string; category: Lead["category"]; kinds: string[] }
> = [
  {
    name: "Forno delle Nuvole",
    category: "Pizzeria",
    website_status: "none",
    whatsapp_confidence: "confirmed_business",
    kinds: ["no_website", "facebook_active", "whatsapp", "reviews"],
  },
  {
    name: "Spicchio di Luna",
    category: "Pizzeria",
    website_status: "external_page_only",
    menu_status: "external_platform",
    kinds: [
      "no_website",
      "menu_ads",
      "curated_social",
      "facebook_active",
      "reviews",
    ],
  },
  {
    name: "Velluto Social Club",
    category: "Cocktail bar",
    website_status: "social_only",
    menu_status: "external_platform",
    whatsapp_confidence: "likely_business",
    kinds: ["no_website", "events", "whatsapp", "curated_social", "reviews"],
  },
  {
    name: "Pane & Rugiada",
    category: "Panificio",
    website_status: "none",
    kinds: ["no_website", "facebook_active", "reviews"],
  },
  {
    name: "Zucchero Gentile",
    category: "Pasticceria",
    website_status: "own_website",
    website_quality: "poor",
    kinds: ["weak_website", "sparse", "curated_social", "reviews"],
  },
  {
    name: "Orto di Ceramica",
    category: "Ristorante",
    website_status: "own_website",
    website_quality: "excellent",
    status: "bad_lead",
    kinds: ["good_website", "reviews"],
  },
  {
    name: "Il Vecchio Girasole",
    category: "Bar",
    status: "bad_lead",
    kinds: ["closed"],
  },
  {
    name: "Due Morsi Felici",
    category: "Panineria",
    website_status: "none",
    status: "contacted",
    kinds: ["no_website", "facebook_active", "reviews"],
  },
  {
    name: "Malto di Carta",
    category: "Pub",
    website_status: "none",
    kinds: ["no_website", "facebook_active", "reviews"],
  },
  {
    name: "Crema di Settembre",
    category: "Gelateria",
    website_status: "unknown",
    kinds: [],
  },
];
const descriptions: Record<string, string> = {
  no_website: "Verifica demo: nessun dominio proprietario",
  facebook_active: "Fixture demo: post recente della pagina business",
  whatsapp: "Fixture demo: WhatsApp esplicitamente pubblicato dall’attività",
  menu_ads: "Fixture HTML demo: 4 blocchi pubblicitari nel menu",
  curated_social: "Revisione manuale demo: foto curate",
  reviews: "Fixture demo: 124 recensioni",
  events: "Fixture demo: DJ set ogni venerdì",
  weak_website: "Fixture HTML demo: 45 parole, nessuna descrizione, 1 immagine",
  sparse: "Homepage demo con 45 parole",
  good_website: "Revisione manuale demo: sito moderno e completo",
  closed: "Fixture demo: chiuso permanentemente",
};
export function demoLeads(): Lead[] {
  return specs.map((s, i) => {
    const { kinds, ...fields } = s;
    const l = newLead({
      ...fields,
      city: "Vittoria",
      address: `Via Esempio ${i + 1}`,
      postal_code: "97019",
      place_id: `demo-place-${i}`,
      phone: "",
      reviews_count: kinds.includes("reviews") ? 124 : 0,
      rating: 4.6,
      is_demo: true,
      notes:
        "Attività fittizia per provare LocalLead. I link example.com sono segnaposto, non contatti reali.",
      website_url:
        fields.website_status === "own_website"
          ? `https://example.com/demo/sito-${i}`
          : "",
      menu_url:
        fields.menu_status === "external_platform"
          ? `https://example.com/demo/menu-${i}`
          : "",
      facebook_url: `https://example.com/demo/pagina-${i}`,
    });
    l.analysis.evidence = kinds.map((kind) => ({
      id: uid(),
      kind,
      text: descriptions[kind],
      url: `https://example.com/demo/fonte-${i}`,
      confidence: 0.95,
    }));
    l.sources = l.analysis.evidence.map((e) => ({
      id: uid(),
      source_type: "demo",
      url: e.url,
      confidence: e.confidence,
      metadata_json: { fixture: true, observation: e.text },
      created_at: now(),
    }));
    l.analysis.events_relevant = kinds.includes("events");
    l.analysis.permanently_closed = kinds.includes("closed");
    l.analysis.analyzed_at = now();
    if (l.status === "contacted")
      l.events.push({
        id: uid(),
        event_type: "contacted",
        channel: "Messenger",
        notes: "Contatto demo da riprendere tra qualche giorno",
        created_at: now(),
      });
    return scoreLead(l);
  });
}
export const demoWorkspace = (): Workspace => ({
  leads: demoLeads().slice(0, 8),
  preferences: { ...defaultPreferences },
});
