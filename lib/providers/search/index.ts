import "server-only";
import type { Lead, Source } from "../../model";
import { uid, now } from "../../model";
import { safeUrl, normalizeText } from "../../utils";
import { providerJson } from "../http";
export interface SearchProvider {
  enrich(lead: Lead): Promise<Source[]>;
}
export class BraveSearchProvider implements SearchProvider {
  async enrich(l: Lead) {
    const q = `"${l.name}" "${l.city}" sito menu Facebook Instagram WhatsApp`;
    const result = (await providerJson(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8&country=IT&search_lang=it`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": process.env.SEARCH_API_KEY!,
        },
      },
    )) as {
      web?: { results?: { url: string; title: string; description: string }[] };
    };
    return (result.web?.results || [])
      .filter((r) => safeUrl(r.url))
      .map((r) => ({
        id: uid(),
        source_type: "brave_candidate",
        url: safeUrl(r.url),
        confidence:
          normalizeText(r.title + " " + r.description).includes(
            normalizeText(l.name),
          ) && normalizeText(r.description).includes(normalizeText(l.city))
            ? 0.7
            : 0.35,
        metadata_json: {
          title: r.title.slice(0, 300),
          snippet: r.description.slice(0, 700),
          requires_verification: true,
        },
        created_at: now(),
      }));
  }
}
export const searchProvider = (): SearchProvider =>
  process.env.SEARCH_PROVIDER === "brave" && process.env.SEARCH_API_KEY
    ? new BraveSearchProvider()
    : { enrich: async () => [] };
