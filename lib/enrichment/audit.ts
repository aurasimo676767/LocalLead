import type { Lead, SiteAudit } from "../model";

export type SiteFinding = {
  kind: "site_ads" | "site_issue";
  text: string;
  confidence: number;
  severe: boolean;
};

const seconds = (ms: number) =>
  (ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 });

/**
 * Turns browser measurements into findings a person can check by opening
 * the site. Only measured facts: the visual opinion lives in `review`.
 */
export function siteFindings(
  a: SiteAudit,
  year = new Date().getFullYear(),
): SiteFinding[] {
  const out: SiteFinding[] = [];
  const add = (text: string, severe: boolean, confidence = 0.9) =>
    out.push({ kind: "site_issue", text, confidence, severe });
  if (a.parked)
    add(
      "Il dominio mostra una pagina di parcheggio o in vendita, non il sito del locale",
      true,
    );
  if (a.under_construction)
    add("Il sito mostra solo una pagina «in costruzione»", true);
  if (a.ads.slots > 0)
    out.push({
      kind: "site_ads",
      text: `${a.ads.slots} ${a.ads.slots === 1 ? "spazio pubblicitario visibile" : "spazi pubblicitari visibili"} sulla homepage${a.ads.networks.length ? ` (${a.ads.networks.join(", ")})` : ""}`,
      confidence: 0.9,
      severe: a.ads.slots >= 3,
    });
  else if (a.ads.networks.length)
    add(
      `La homepage carica script pubblicitari (${a.ads.networks.join(", ")})`,
      false,
      0.75,
    );
  if (!a.mobile) {
    // Phone visit not measured: no claim either way.
  } else if (!a.mobile.viewport)
    add(
      "Manca l’adattamento al telefono: da smartphone la pagina appare rimpicciolita",
      true,
    );
  else if (a.mobile.page_width > a.mobile.screen_width + 8)
    add(
      `Da telefono la pagina è più larga dello schermo (${a.mobile.page_width}px su ${a.mobile.screen_width}px) e va spostata di lato`,
      true,
    );
  if (a.mobile && a.mobile.small_text_pct >= 30)
    add(
      `Da telefono il ${a.mobile.small_text_pct}% del testo è più piccolo di 12px`,
      false,
    );
  if (a.load_ms !== null && a.load_ms > 6000)
    add(
      `La homepage impiega ${seconds(a.load_ms)} secondi a caricarsi`,
      a.load_ms > 10000,
    );
  if (a.popups > 0)
    add("All’apertura un popup copre buona parte della pagina", false, 0.8);
  if (a.broken_images >= 2)
    add(`${a.broken_images} immagini della homepage non si caricano`, false);
  if (a.copyright_year && a.copyright_year <= year - 3)
    add(
      `Il footer riporta ancora «© ${a.copyright_year}»: il sito potrebbe non essere aggiornato`,
      false,
      0.75,
    );
  if (!a.https)
    add("Il sito non usa HTTPS: il browser lo segna come non sicuro", false);
  if (!a.parked && !a.under_construction && a.word_count < 100)
    add(`La homepage contiene solo ${a.word_count} parole di testo`, false);
  if (a.menu.pdf_only)
    add("Il menu è solo un PDF da scaricare, scomodo da telefono", false, 0.85);
  else if (!a.menu.links.length && !a.menu.on_page)
    add("Nella homepage non c’è un menu o un link al menu", false, 0.7);
  return out;
}

/** Never "excellent": that needs a person looking at the site. */
export function siteQuality(
  a: SiteAudit,
  findings: SiteFinding[],
): Lead["website_quality"] {
  if (a.status >= 400) return "broken";
  const severe = findings.filter((f) => f.severe).length;
  const minor = findings.length - severe;
  if (severe || minor >= 3) return "poor";
  if (minor) return "average";
  return a.menu.links.length || a.menu.on_page ? "good" : "average";
}
