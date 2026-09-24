import "server-only";
import type { Browser, BrowserContext, Page } from "playwright";
import { resolvePublic } from "../providers/http";
import type { SiteAudit } from "../model";

// Opens a business homepage in headless Chromium the way a visitor would.
// Local use only (WEBSITE_BROWSER=true): serverless hosts lack the browser.
export const browserAuditEnabled = () => process.env.WEBSITE_BROWSER === "true";

const AD_NETWORKS: [RegExp, string][] = [
  [/googlesyndication\.com|adservice\.google|doubleclick\.net/, "Google Ads"],
  [/amazon-adsystem\.com/, "Amazon Ads"],
  [/taboola\.com/, "Taboola"],
  [/outbrain\.com/, "Outbrain"],
  [/criteo\.(?:com|net)/, "Criteo"],
  [/adnxs\.com/, "Xandr"],
  [/pubmatic\.com/, "PubMatic"],
  [/rubiconproject\.com/, "Magnite"],
  [/smartadserver\.com/, "Smart AdServer"],
  [/teads\.tv/, "Teads"],
  [/media\.net/, "Media.net"],
  [/propellerads|popads|adsterra/, "reti pop-under"],
  [/mgid\.com/, "MGID"],
  [/ezoic/, "Ezoic"],
  [/seedtag/, "Seedtag"],
];
const BLOCKED =
  /just a moment|access denied|attention required|verify you are human|rate limited|error 10\d\d/i;
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

let shared: Promise<Browser> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
async function browser() {
  clearTimeout(idle);
  if (!shared) {
    const { chromium } = await import("playwright");
    shared = chromium.launch({ headless: true }).catch((error) => {
      shared = null;
      throw error;
    });
  }
  const b = await shared;
  // Close Chromium after a quiet period so it does not linger in dev.
  idle = setTimeout(() => {
    shared = null;
    void b.close();
  }, 120_000);
  idle.unref();
  return b;
}

/** Every request, including redirects and subresources, must reach a public host. */
async function guard(context: BrowserContext) {
  const hosts = new Map<string, Promise<boolean>>();
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (!/^https?:/i.test(url)) return route.abort();
    const host = new URL(url).host;
    if (!hosts.has(host))
      hosts.set(
        host,
        resolvePublic(url).then(
          () => true,
          () => false,
        ),
      );
    return (await hosts.get(host)) ? route.continue() : route.abort();
  });
}

async function open(page: Page, url: string) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  // Late ads, popups and lazy content.
  await page
    .waitForLoadState("networkidle", { timeout: 4_000 })
    .catch(() => {});
  return response;
}

// Ads in the EU usually load only after consent: accept like a visitor would.
const ACCEPT =
  /^\s*(accetta|accetto|accetta tutt[io]|accetta e chiudi|accept|accept all|allow all|consenti|consenti tutti|agree|ok|ho capito)\s*$/i;
async function acceptCookies(page: Page) {
  for (const frame of page.frames()) {
    const button = frame.getByRole("button", { name: ACCEPT }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(3_000);
      return;
    }
  }
}
const AD_SLOTS =
  "ins.adsbygoogle, [id^='div-gpt-ad'], [id^='google_ads_iframe'], iframe[src*='doubleclick'], iframe[src*='googlesyndication'], [data-ad-slot], [data-ad-client], iframe[id*='taboola'], [id^='taboola-'], .OUTBRAIN";
/* Runs inside the page. Kept self-contained: it is serialized by Playwright. */
function countAds(selector: string) {
  return [...document.querySelectorAll(selector)].filter((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 30 &&
      r.height > 30 &&
      s.visibility !== "hidden" &&
      s.display !== "none" &&
      // Nested matches (an iframe inside a slot) count once.
      !el.parentElement?.closest(selector)
    );
  }).length;
}
function readDesktop() {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 30 &&
      r.height > 30 &&
      s.visibility !== "hidden" &&
      s.display !== "none"
    );
  };
  const text = document.body?.innerText || "";
  const links = [...document.querySelectorAll("a[href]")].map(
    (a) => (a as HTMLAnchorElement).href,
  );
  const hrefs = [...document.querySelectorAll("a[href]")].map(
    (a) => a.getAttribute("href") || "",
  );
  // The menu link is often "Menu" or "Le pizze" in the navigation, not in the URL.
  const menuLinks = [...document.querySelectorAll("a[href]")]
    .filter(
      (a) =>
        /men[uù]|carta|listino|\.pdf/i.test(a.getAttribute("href") || "") ||
        /^\s*(?:il |la |le |i )?(?:nostr[oaie] )?(?:men[uù]|carta|listino|pizze)\b/i.test(
          (a.textContent || "").slice(0, 60),
        ),
    )
    .map((a) => (a as HTMLAnchorElement).href);
  // Fixed layers covering a large part of the screen right after loading.
  let popups = 0;
  let cookie = false;
  const area = innerWidth * innerHeight;
  for (const el of [...document.querySelectorAll("body *")].slice(0, 4000)) {
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cover =
      (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))) /
      area;
    const label = (el.textContent || "").slice(0, 600);
    if (/cookie|consenso|privacy/i.test(label)) cookie = true;
    else if (cover >= 0.35) popups++;
  }
  const images = [...document.images];
  const years = [
    ...text.matchAll(
      /(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi,
    ),
  ].map((m) => Number(m[1]));
  const meta = (name: string) =>
    document.querySelector(`meta[name='${name}']`)?.getAttribute("content") ||
    "";
  return {
    title: document.title.slice(0, 300),
    description: meta("description").slice(0, 500),
    generator: meta("generator"),
    word_count: text.split(/\s+/).filter(Boolean).length,
    text: text.slice(0, 20_000),
    image_count: images.length,
    broken_images: images.filter(
      (i) => i.complete && i.naturalWidth === 0 && !!i.currentSrc,
    ).length,
    copyright_year: years.length ? Math.max(...years) : null,
    menu_links: menuLinks,
    popups,
    cookie,
    links,
    whatsapp: hrefs.some((h) => /wa\.me|whatsapp\.com/i.test(h)),
    tel: hrefs.some((h) => /^tel:/i.test(h)),
    email: hrefs.some((h) => /^mailto:/i.test(h)),
    map: !!document.querySelector(
      "iframe[src*='google.com/maps'], iframe[src*='maps.google']",
    ),
  };
}
function readMobile() {
  const text: { total: number; small: number } = { total: 0, small: 0 };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const value = (walker.currentNode.textContent || "").trim();
    const el = walker.currentNode.parentElement;
    if (value.length < 3 || !el) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    text.total += value.length;
    if (parseFloat(getComputedStyle(el).fontSize) < 12)
      text.small += value.length;
  }
  return {
    viewport: /width\s*=\s*device-width/i.test(
      document
        .querySelector("meta[name='viewport']")
        ?.getAttribute("content") || "",
    ),
    page_width: document.documentElement.scrollWidth,
    screen_width: innerWidth,
    small_text_pct: text.total
      ? Math.round((100 * text.small) / text.total)
      : 0,
  };
}

const TECH: [RegExp, string][] = [
  [/wp-content|wp-includes/, "WordPress"],
  [/wixstatic\.com|_wix/, "Wix"],
  [/jimdo/, "Jimdo"],
  [/squarespace/, "Squarespace"],
  [/weebly/, "Weebly"],
  [/img1\.wsimg\.com/, "GoDaddy Website Builder"],
  [/webnode/, "Webnode"],
  [/shopify/, "Shopify"],
  [/elementor/, "Elementor"],
  [/joomla/i, "Joomla"],
  [/__NEXT_DATA__|\/_next\//, "Next.js"],
];

export type BrowserAudit = {
  audit: SiteAudit;
  html: string;
  desktop: Buffer | null;
  mobile: Buffer | null;
};

export async function auditWebsite(
  url: string,
  { screenshots = true } = {},
): Promise<BrowserAudit> {
  const b = await browser();
  const desktop = await b.newContext({
    userAgent: DESKTOP_UA,
    viewport: { width: 1366, height: 800 },
    locale: "it-IT",
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  const mobile = await b.newContext({
    userAgent: MOBILE_UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "it-IT",
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  try {
    await guard(desktop);
    await guard(mobile);
    const page = await desktop.newPage();
    const networks = new Set<string>();
    let requests = 0;
    let errors = 0;
    page.on("request", (request) => {
      requests++;
      for (const [pattern, name] of AD_NETWORKS)
        if (pattern.test(request.url())) networks.add(name);
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors++;
    });
    const response = await open(page, url);
    const loadMs = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      return nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null;
    });
    const seen = await page.evaluate(readDesktop);
    await acceptCookies(page);
    const slots = await page.evaluate(countAds, AD_SLOTS).catch(() => 0);
    const html = await page.content();
    const shotDesktop = screenshots
      ? await page.screenshot({ type: "jpeg", quality: 70 }).catch(() => null)
      : null;
    const phone = await mobile.newPage();
    const phoneResponse = await open(phone, page.url()).catch(() => null);
    // Rate limits and bot checks answer the second visit: never measure an error page.
    const phoneOk =
      !!phoneResponse &&
      phoneResponse.status() < 400 &&
      !BLOCKED.test(await phone.title().catch(() => ""));
    if (phoneOk) await acceptCookies(phone);
    const small = phoneOk
      ? await phone.evaluate(readMobile).catch(() => null)
      : null;
    const shotMobile =
      screenshots && phoneOk
        ? await phone
            .screenshot({ type: "jpeg", quality: 70 })
            .catch(() => null)
        : null;
    const finalUrl = page.url();
    const text = seen.text;
    const menuLinks = [...new Set(seen.menu_links)].slice(0, 12);
    const audit: SiteAudit = {
      checked_at: new Date().toISOString(),
      final_url: finalUrl,
      status: response?.status() ?? 0,
      load_ms: loadMs,
      requests,
      https: finalUrl.startsWith("https:"),
      title: seen.title,
      description: seen.description,
      word_count: seen.word_count,
      image_count: seen.image_count,
      broken_images: seen.broken_images,
      copyright_year: seen.copyright_year,
      technologies: [
        ...new Set([
          ...(seen.generator ? [seen.generator.slice(0, 60)] : []),
          ...TECH.filter(([p]) => p.test(html)).map(([, name]) => name),
        ]),
      ],
      ads: { slots, networks: [...networks] },
      popups: seen.popups,
      cookie_banner: seen.cookie,
      // A page wider than the phone widens the layout viewport too: compare with the device.
      mobile: small && { ...small, screen_width: 390 },
      menu: {
        links: menuLinks,
        pdf_only:
          menuLinks.length > 0 &&
          menuLinks.every((l) => /\.pdf(?:[?#]|$)/i.test(l)),
        on_page: /\bmen[uù]\b/i.test(text) && /€|\beuro\b/i.test(text),
      },
      booking_links: [
        ...new Set(
          seen.links.filter((l) =>
            /thefork|quandoo|opentable|prenota|booking|resmio|covermanager/i.test(
              l,
            ),
          ),
        ),
      ].slice(0, 5),
      ordering_links: [
        ...new Set(
          seen.links.filter((l) =>
            /deliveroo|justeat|glovo|ubereats|ordina|order|takeaway/i.test(l),
          ),
        ),
      ].slice(0, 5),
      whatsapp_link: seen.whatsapp,
      tel_link: seen.tel,
      email_link: seen.email,
      map_embed: seen.map,
      social_links: [
        ...new Set(
          seen.links.filter((l) =>
            /facebook\.com|instagram\.com|tiktok\.com/i.test(l),
          ),
        ),
      ].slice(0, 6),
      parked:
        /(?:domain|dominio)[^.]{0,40}(?:for sale|in vendita)|buy this domain|parked (?:free|domain)|domain parking|sedo(?:parking)?\.com/i.test(
          text,
        ),
      under_construction:
        seen.word_count < 200 &&
        /sito in costruzione|under construction|coming soon|lavori in corso|work in progress|nuovo sito in arrivo/i.test(
          text,
        ),
      console_errors: errors,
      screenshots: { desktop: !!shotDesktop, mobile: !!shotMobile },
    };
    return { audit, html, desktop: shotDesktop, mobile: shotMobile };
  } finally {
    await desktop.close().catch(() => {});
    await mobile.close().catch(() => {});
  }
}
