import { z } from "zod";
export const categories = [
  "Pizzeria",
  "Panineria",
  "Ristorante",
  "Bar",
  "Pub",
  "Cocktail bar",
  "Pasticceria",
  "Gelateria",
  "Panificio",
  "Gastronomia",
  "Rosticceria",
  "Altro food",
] as const;
export const statuses = [
  "new",
  "analyzing",
  "shortlisted",
  "ready_to_contact",
  "contacted",
  "seen",
  "replied_positive",
  "replied_negative",
  "no_reply",
  "not_interested",
  "bad_lead",
  "archived",
] as const;
export const statusLabels: Record<string, string> = {
  new: "Nuovo",
  analyzing: "In analisi",
  shortlisted: "Selezionato",
  ready_to_contact: "Da contattare",
  contacted: "Contattato",
  seen: "Visualizzato",
  replied_positive: "Risposta positiva",
  replied_negative: "Risposta negativa",
  no_reply: "Nessuna risposta",
  not_interested: "Non interessato",
  bad_lead: "Scartato",
  archived: "Archiviato",
};
export const websiteStatuses = [
  "none",
  "own_website",
  "external_page_only",
  "social_only",
  "broken",
  "unknown",
] as const;
export const qualities = [
  "excellent",
  "good",
  "average",
  "poor",
  "broken",
  "unknown",
] as const;
export const menuStatuses = [
  "none",
  "own_website",
  "pdf",
  "instagram_only",
  "facebook_only",
  "external_platform",
  "delivery_platform",
  "unknown",
] as const;
export const whatsappConfidences = [
  "confirmed_business",
  "likely_business",
  "uncertain",
  "not_available",
] as const;
export type Evidence = {
  id: string;
  kind: string;
  text: string;
  url: string;
  confidence: number;
};
export type Source = {
  id: string;
  source_type: string;
  url: string;
  confidence: number;
  metadata_json: Record<string, unknown>;
  created_at: string;
};
export type Message = {
  id: string;
  message_type: string;
  text: string;
  model: string;
  created_at: string;
};
export type LeadEvent = {
  id: string;
  event_type: string;
  notes: string;
  channel?: string;
  created_at: string;
};
export type ScoreReason = {
  label: string;
  points: number;
  evidence_ids: string[];
};
export type HtmlFeatures = {
  title: string;
  description: string;
  viewport: boolean;
  https: boolean;
  status: number;
  word_count: number;
  image_count: number;
  menu_links: string[];
  social_links: string[];
  main_pages: string[];
  contact_links: string[];
  footer: string;
  technologies: string[];
  date_hint: string;
  excerpt: string;
  event_signals: string[];
  has_events_page: boolean;
  ad_markers: number;
  final_url: string;
};
export type Analysis = {
  evidence: Evidence[];
  reasons: ScoreReason[];
  features: HtmlFeatures | null;
  events_relevant: boolean;
  permanently_closed: boolean;
  analyzed_at: string | null;
  screenshot_url: string | null;
  warnings: string[];
  dedup_aliases?: string[];
  outreach_context?: "ready" | "insufficient_outreach_context";
  contact_reason?: string;
};
export type Lead = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  category: (typeof categories)[number];
  city: string;
  address: string;
  postal_code: string;
  phone: string;
  website_url: string;
  facebook_url: string;
  instagram_url: string;
  menu_url: string;
  maps_url: string;
  place_id: string;
  rating: number | null;
  reviews_count: number;
  latitude: number | null;
  longitude: number | null;
  opening_hours: string[];
  website_status: (typeof websiteStatuses)[number];
  website_quality: (typeof qualities)[number];
  menu_status: (typeof menuStatuses)[number];
  whatsapp_confidence: (typeof whatsappConfidences)[number];
  main_problem: string;
  opportunity: string;
  ai_summary: string;
  lead_score: number;
  confidence_score: number;
  status: (typeof statuses)[number];
  do_not_contact: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  analysis: Analysis;
  sources: Source[];
  messages: Message[];
  events: LeadEvent[];
  is_demo: boolean;
};
export const preferencesSchema = z.object({
  tone: z.enum(["molto casual", "casual", "neutro"]).default("casual"),
  qr: z.boolean().default(true),
  events: z.boolean().default(true),
  restyling: z.boolean().default(true),
  local: z.boolean().default(true),
  free_demo: z.boolean().default(false),
  // Only the first name: the surname can come later in the conversation.
  sender_name: z.string().trim().max(40).default("Simone"),
  sender_city: z.string().trim().max(60).default("Vittoria"),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = preferencesSchema.parse({});
export type Workspace = { leads: Lead[]; preferences: Preferences };
export type PublicConfig = {
  demo: boolean;
  places: string;
  search: string;
  screenshot: string;
  model: string;
  ai: boolean;
  auth: boolean;
};
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export function newLead(
  input: Partial<Lead> & Pick<Lead, "name" | "city" | "category">,
): Lead {
  return {
    id: uid(),
    user_id: "",
    slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    address: "",
    postal_code: "",
    phone: "",
    website_url: "",
    facebook_url: "",
    instagram_url: "",
    menu_url: "",
    maps_url: "",
    place_id: "",
    rating: null,
    reviews_count: 0,
    latitude: null,
    longitude: null,
    opening_hours: [],
    website_status: "unknown",
    website_quality: "unknown",
    menu_status: "unknown",
    whatsapp_confidence: input.phone ? "uncertain" : "not_available",
    main_problem: "Dati da verificare",
    opportunity: "Raccogli altre evidenze prima di contattare",
    ai_summary: "",
    lead_score: 0,
    confidence_score: 0,
    status: "new",
    do_not_contact: false,
    notes: "",
    created_at: now(),
    updated_at: now(),
    analysis: {
      evidence: [],
      reasons: [],
      features: null,
      events_relevant: false,
      permanently_closed: false,
      analyzed_at: null,
      screenshot_url: null,
      warnings: [],
    },
    sources: [],
    messages: [],
    events: [],
    is_demo: false,
    ...input,
  };
}
export const contacted = (l: Lead) =>
  l.events.some((e) => e.event_type === "contacted") ||
  [
    "contacted",
    "seen",
    "replied_positive",
    "replied_negative",
    "no_reply",
    "not_interested",
  ].includes(l.status);
export const contactable = (l: Lead) =>
  !l.do_not_contact &&
  !l.analysis.permanently_closed &&
  !["bad_lead", "archived", "not_interested", "replied_negative"].includes(
    l.status,
  );
