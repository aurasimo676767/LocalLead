import { load } from "cheerio";
import type { HtmlFeatures, Lead } from "../model";
import {
  domain,
  safeUrl,
  social,
  externalMenu,
  delivery,
  hostIs,
} from "../utils";
export function extractHtml(
  html: string,
  url: string,
  status = 200,
): HtmlFeatures {
  const $ = load(html);
  const links: string[] = [];
  const contacts: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/^(tel:|mailto:)/i.test(href)) contacts.push(href.slice(0, 200));
    try {
      const link = safeUrl(new URL(href, url).href);
      if (link) links.push(link);
    } catch {}
  });
  const title = $("title").first().text().trim().slice(0, 300),
    description =
      $("meta[name='description']").attr("content")?.slice(0, 500) || "";
  const footer = $("footer").text().replace(/\s+/g, " ").trim().slice(0, 400);
  const image_count = $("img").length;
  const viewport = /width\s*=\s*device-width/i.test(
    $("meta[name='viewport']").attr("content") || "",
  );
  const generator = $("meta[name='generator']").attr("content") || "";
  const ad_markers = $(
    "ins.adsbygoogle, [id^='div-gpt-ad'], iframe[src*='doubleclick.net'], [data-ad-client]",
  ).length;
  $("script,style,noscript,svg,nav,header,footer").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const signals = [
    ...text.matchAll(
      /.{0,65}\b(?:dj set|live music|musica dal vivo|karaoke|serate|party)\b.{0,85}/gi,
    ),
  ]
    .map((m) => m[0])
    .slice(0, 5);
  return {
    title,
    description,
    viewport,
    https: url.startsWith("https:"),
    status,
    word_count: text.split(/\s+/).filter(Boolean).length,
    image_count,
    menu_links: [
      ...new Set(links.filter((l) => /menu|menù|carta|drink|\.pdf/i.test(l))),
    ].slice(0, 12),
    social_links: [...new Set(links.filter(social))].slice(0, 10),
    main_pages: [
      ...new Set(links.filter((l) => domain(l) === domain(url))),
    ].slice(0, 25),
    contact_links: [...new Set(contacts)].slice(0, 15),
    footer,
    technologies: [
      generator,
      /wp-content/.test(html) ? "WordPress" : "",
      /wixstatic/.test(html) ? "Wix" : "",
      /__NEXT_DATA__|_next\//.test(html) ? "Next.js" : "",
    ].filter(Boolean),
    date_hint: footer.match(/\b20\d{2}\b/g)?.at(-1) || "",
    excerpt: text.slice(0, 2400),
    event_signals: signals,
    has_events_page: links.some((l) => /\/event|\/serate/.test(l)),
    ad_markers,
    final_url: url,
  };
}
export function classifyWebsite(f: HtmlFeatures): Lead["website_quality"] {
  if (f.status >= 400) return "broken";
  if (f.word_count < 20) return "unknown"; // JS-only sites cannot be judged from HTML.
  if (f.word_count < 100 && f.image_count < 3) return "poor";
  if (!f.viewport && f.word_count < 250) return "poor";
  if (
    f.viewport &&
    f.https &&
    f.word_count > 350 &&
    f.image_count >= 5 &&
    f.description &&
    f.contact_links.length &&
    f.menu_links.length
  )
    return "good";
  return "average"; // excellent requires a visual/manual review, never inferred from tags.
}
export function classifyMenu(
  url: string,
  website: string,
): Lead["menu_status"] {
  if (!url) return "unknown";
  if (/\.pdf(?:[?#]|$)/i.test(url)) return "pdf";
  if (hostIs(url, "instagram.com")) return "instagram_only";
  if (hostIs(url, "facebook.com")) return "facebook_only";
  if (delivery(url)) return "delivery_platform";
  if (externalMenu(url)) return "external_platform";
  return domain(url) === domain(website) ? "own_website" : "external_platform";
}
