import { z } from "zod";
import {
  categories,
  statuses,
  whatsappConfidences,
  websiteStatuses,
} from "./model";
import { safeUrl, hostIs, normalizePhone } from "./utils";
const url = z
  .string()
  .max(2048)
  .refine(
    (v) => !v || !!safeUrl(v),
    "Inserisci un URL http/https pubblico valido",
  )
  .transform((v) => (v ? safeUrl(v) : ""));
const fieldsSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  category: z.enum(categories),
  address: z.string().max(300),
  phone: z
    .string()
    .max(40)
    .refine((v) => !v || !!normalizePhone(v), "Numero non valido")
    .transform((v) => normalizePhone(v)),
  website_url: url,
  facebook_url: url.refine(
    (v) => !v || hostIs(v, "facebook.com"),
    "Serve un link Facebook",
  ),
  instagram_url: url.refine(
    (v) => !v || hostIs(v, "instagram.com"),
    "Serve un link Instagram",
  ),
  menu_url: url,
  notes: z.string().max(10000),
});
// Creation has defaults; PATCH deliberately does not. In Zod 4, nested
// defaults can otherwise materialize omitted keys even under .partial().
export const inputSchema = fieldsSchema.extend({
  address: fieldsSchema.shape.address.default(""),
  phone: fieldsSchema.shape.phone.default(""),
  website_url: fieldsSchema.shape.website_url.default(""),
  facebook_url: fieldsSchema.shape.facebook_url.default(""),
  instagram_url: fieldsSchema.shape.instagram_url.default(""),
  menu_url: fieldsSchema.shape.menu_url.default(""),
  notes: fieldsSchema.shape.notes.default(""),
});
export const patchSchema = fieldsSchema.partial().extend({
  status: z.enum(statuses).optional(),
  do_not_contact: z.boolean().optional(),
  whatsapp_confidence: z.enum(whatsappConfidences).optional(),
  website_status: z.enum(websiteStatuses).optional(),
  verification_url: url.optional(),
  verification_note: z.string().max(1000).optional(),
  channel: z
    .enum(["WhatsApp", "Messenger", "Instagram", "Email", "altro"])
    .optional(),
  event_notes: z.string().max(2000).optional(),
});
export const discoverySchema = z.object({
  city: z.string().trim().min(2).max(120),
  categories: z.array(z.enum(categories)).min(1).max(12),
  limit: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
  filter: z.enum(["all", "none", "weak_or_none", "weak"]).default("all"),
});
export type LeadInput = z.infer<typeof inputSchema>;
