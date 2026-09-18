import { parsePhoneNumberFromString } from "libphonenumber-js";
import ipaddr from "ipaddr.js";
import type { Lead } from "./model";
import { contactable } from "./model";
export const normalizeText = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function normalizePhone(value: string): string {
  const cleaned = value.trim().replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(cleaned, "IT");
  return parsed?.isValid() ? parsed.number : "";
}
export function isLandlinePhone(value: string): boolean {
  const cleaned = value.trim().replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(cleaned, "IT");
  return parsed?.isValid() === true && parsed.getType() === "FIXED_LINE";
}
export function publicIp(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function safeUrl(input: string): string {
  if (!input || input.length > 2048) return "";
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      return "";
    if (ipaddr.isValid(host)) {
      if (!publicIp(host)) return "";
    } else if (
      !host.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(
        host,
      ) ||
      host.endsWith(".")
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}
export function domain(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function hostIs(url: string, host: string) {
  const d = domain(url);
  return d === host || d.endsWith(`.${host}`);
}
export const social = (url: string) =>
  ["facebook.com", "instagram.com", "tiktok.com", "linktr.ee"].some((h) =>
    hostIs(url, h),
  );
export const externalMenu = (url: string) =>
  [
    "pizzait.it",
    "pizzait.com",
    "isycity.it",
    "isycity.com",
    "4cloudoffice.com",
    "qromo.io",
    "dish.co",
    "leggimenu.it",
    "menu-digitale.it",
  ].some((h) => hostIs(url, h));
export const delivery = (url: string) =>
  ["justeat.it", "deliveroo.it", "glovoapp.com", "ubereats.com"].some((h) =>
    hostIs(url, h),
  );
export function dedupKeys(
  l: Pick<
    Lead,
    "place_id" | "phone" | "website_url" | "name" | "address" | "city"
  > & { analysis?: Lead["analysis"] },
) {
  const phone = normalizePhone(l.phone),
    d = domain(l.website_url),
    name = normalizeText(l.name);
  return [
    ...new Set(
      [
        l.place_id && `place:${l.place_id}`,
        phone && `phone:${phone}`,
        d &&
          !social(l.website_url) &&
          !externalMenu(l.website_url) &&
          !delivery(l.website_url) &&
          `domain:${d}`,
        name &&
          normalizeText(l.address) &&
          `address:${name}:${normalizeText(l.address)}`,
        name &&
          normalizeText(l.city) &&
          `city:${name}:${normalizeText(l.city)}`,
        ...(l.analysis?.dedup_aliases || []),
      ].filter(Boolean),
    ),
  ] as string[];
}
export function duplicate(lead: Lead, existing: Lead[]) {
  for (const key of dedupKeys(lead)) {
    const found = existing.find(
      (x) => x.id !== lead.id && dedupKeys(x).includes(key),
    );
    if (found) return found;
  }
  return undefined;
}
// WhatsApp can show emoji in a prefilled draft as "?": older drafts lose them here.
const chatUrl = (number: string, message: string) =>
  `https://api.whatsapp.com/send?phone=${number.slice(1)}&text=${encodeURIComponent(
    message
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +(\n|$)/g, "$1"),
  )}`;
export function whatsappUrl(lead: Lead, message: string) {
  const number = normalizePhone(lead.phone);
  if (
    !number ||
    isLandlinePhone(number) ||
    !contactable(lead) ||
    !["confirmed_business", "likely_business"].includes(
      lead.whatsapp_confidence,
    )
  )
    return "";
  return chatUrl(number, message);
}
export function whatsappCheckUrl(lead: Lead, message: string) {
  const number = normalizePhone(lead.phone);
  if (!number || isLandlinePhone(number) || !contactable(lead)) return "";
  return chatUrl(number, message);
}
