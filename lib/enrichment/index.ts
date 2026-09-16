import "server-only";
import { type Lead, uid, now } from "../model";
import { publicHtml } from "../providers/http";
import { searchProvider } from "../providers/search";
import { extractHtml, classifyWebsite, classifyMenu } from "./html";
import {
  social,
  externalMenu,
  delivery,
  hostIs,
  normalizePhone,
} from "../utils";
import { scoreLead } from "../scoring";
const ANALYSIS_VERSION = "reachability-v5";
export async function enrichLead(input: Lead): Promise<Lead> {
  if (input.is_demo) return scoreLead(input);
  const hours = Number(process.env.ANALYSIS_CACHE_HOURS || 72);
  const needsWebsiteFetch =
    !!input.website_url &&
    !social(input.website_url) &&
    !externalMenu(input.website_url) &&
    !delivery(input.website_url);
  const hasCurrentWebsiteCheck = input.sources.some(
    (source) =>
      source.source_type === "website_analysis" &&
      source.metadata_json.analysis_version === ANALYSIS_VERSION,
  );
  if (
    input.analysis.analyzed_at &&
    Date.now() - Date.parse(input.analysis.analyzed_at) < hours * 3600_000 &&
    (!needsWebsiteFetch || hasCurrentWebsiteCheck)
  )
    return input;
  const l: Lead = structuredClone(input);
  l.analysis.warnings = [];
  // Preserve manual/provider facts. Rebuild HTML facts after cache expiry.
  l.analysis.evidence = l.analysis.evidence.filter(
    (e) =>
      !e.kind.startsWith("html_") &&
      ![
        "weak_website",
        "sparse",
        "good_website",
        "events",
        "menu_ads",
        "website_unreachable",
        "website_check_failed",
      ].includes(e.kind),
  );
  l.analysis.features = null;
  l.analysis.outreach_context = undefined;
  l.analysis.contact_reason = undefined;
  l.analysis.events_relevant = false;
  try {
    const extra = await searchProvider().enrich(l);
    l.sources.push(
      ...extra.filter((s) => !l.sources.some((x) => x.url === s.url)),
    );
    console.info("[enrichment]", { id: l.id, candidates: extra.length });
  } catch {
    l.analysis.warnings.push(
      "Ricerca aggiuntiva non disponibile: inserisci i link manualmente",
    );
  }
  const add = (kind: string, text: string, url: string, confidence = 0.85) =>
    l.analysis.evidence.push({ id: uid(), kind, text, url, confidence });
  if (l.website_url) {
    if (social(l.website_url)) l.website_status = "social_only";
    else if (externalMenu(l.website_url) || delivery(l.website_url))
      l.website_status = "external_page_only";
    else {
      l.website_status = "own_website";
      try {
        const page = await publicHtml(l.website_url);
        if (
          /<title[^>]*>\s*(?:just a moment|access denied|attention required|verify you are human)/i.test(
            page.body,
          )
        )
          throw new Error(
            "Il sito mostra una verifica di accesso al lettore automatico",
          );
        if (
          page.status >= 400 &&
          ![404, 410].includes(page.status) &&
          page.status < 500
        )
          throw new Error("Il sito limita o rifiuta l’accesso automatico");
        if (!page.body && page.status < 400)
          throw new Error("Contenuto HTML non disponibile");
        const f = extractHtml(page.body, page.url, page.status);
        l.analysis.features = f;
        l.website_quality = classifyWebsite(f);
        if (f.status >= 400) {
          throw new Error(
            `Il controllo automatico ha ricevuto HTTP ${f.status}; il sito va verificato nel browser`,
          );
        } else if (l.website_quality === "poor")
          add(
            "weak_website",
            `Homepage: ${f.word_count} parole, ${f.image_count} immagini, viewport ${f.viewport ? "presente" : "assente"}`,
            page.url,
          );
        if (f.word_count >= 20 && f.word_count < 100)
          add("sparse", `Homepage: ${f.word_count} parole leggibili`, page.url);
        if (l.website_quality === "good")
          add(
            "good_website",
            "Homepage completa nei controlli HTML: menu, contatti, immagini e viewport",
            page.url,
          );
        if (!f.viewport)
          add(
            "html_viewport",
            "Meta viewport mobile non rilevato; non è un test visivo responsive",
            page.url,
          );
        if (!f.menu_links.length)
          add(
            "html_menu",
            "Nessun link menu riconosciuto nella homepage; verificare altre pagine",
            page.url,
            0.7,
          );
        if (!l.menu_url) l.menu_url = f.menu_links[0] || "";
        if (!l.facebook_url)
          l.facebook_url =
            f.social_links.find((s) => hostIs(s, "facebook.com")) || "";
        if (!l.instagram_url)
          l.instagram_url =
            f.social_links.find((s) => hostIs(s, "instagram.com")) || "";
        for (const link of [...f.menu_links, ...f.social_links])
          if (!l.sources.some((s) => s.url === link))
            l.sources.push({
              id: uid(),
              source_type: "website_link",
              url: link,
              confidence: 0.9,
              metadata_json: { parent: page.url },
              created_at: now(),
            });
        l.analysis.events_relevant = f.event_signals.length > 0;
        for (const text of f.event_signals) add("events", text, page.url, 0.8);
        // Only an explicit WhatsApp link on the supplied official site confirms the channel.
        const wa = page.body.match(/https:\/\/wa\.me\/(\d{8,15})/i);
        if (wa) {
          const number = normalizePhone(`+${wa[1]}`);
          if (number && (!l.phone || l.phone === number)) {
            l.phone = number;
            l.whatsapp_confidence = "confirmed_business";
            add(
              "whatsapp",
              "Link wa.me pubblicato nel sito ufficiale",
              page.url,
              0.95,
            );
          }
        }
        l.sources.push({
          id: uid(),
          source_type: "website_analysis",
          url: page.url,
          confidence: 0.85,
          metadata_json: {
            http_status: page.status,
            checked_at: now(),
            analysis_version: ANALYSIS_VERSION,
          },
          created_at: now(),
        });
      } catch (error) {
        l.website_quality = "unknown";
        l.website_status = "unknown";
        add(
          "website_check_failed",
          "L’analisi automatica non ha potuto leggere il sito; funzionamento da verificare nel browser",
          l.website_url,
          0.5,
        );
        l.analysis.warnings.push(
          "Non siamo riusciti a leggere il sito automaticamente. Aprilo nel browser per verificarlo: questo non significa che non funzioni.",
        );
        console.warn("[website analysis] fetch failed", {
          id: l.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }
  l.menu_status = classifyMenu(l.menu_url, l.website_url);
  if (
    l.menu_url &&
    l.menu_status === "external_platform" &&
    !social(l.menu_url)
  ) {
    try {
      const page = await publicHtml(l.menu_url);
      const f = extractHtml(page.body, page.url, page.status);
      if (f.ad_markers >= 3)
        add(
          "menu_ads",
          `${f.ad_markers} elementi pubblicitari riconoscibili nel menu`,
          page.url,
          0.9,
        );
    } catch {
      l.analysis.warnings.push(
        "Menu esterno non analizzabile: nessun giudizio sulla pubblicità",
      );
    }
  }
  if (!l.analysis.evidence.some((e) => e.kind === "whatsapp"))
    l.whatsapp_confidence = l.phone ? "uncertain" : "not_available";
  l.analysis.analyzed_at = now();
  l.updated_at = now();
  console.info("[website analysis]", {
    id: l.id,
    quality: l.website_quality,
    evidence: l.analysis.evidence.length,
  });
  return scoreLead(l);
}
