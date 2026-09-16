import type { Lead } from "./model";

// Older analyses stored local network errors as website_unreachable.
// A 5xx can be temporary or an anti-bot response while the site works in a
// browser. Only a definitive missing homepage or a manual check is suitable.
export function websiteFailureEvidence(lead: Lead) {
  return lead.analysis.evidence.find(
    (e) =>
      e.kind === "website_unreachable" &&
      e.confidence >= 0.7 &&
      !!e.url &&
      (/\bHTTP\s+(?:404|410)\b/i.test(e.text) ||
        (lead.website_status === "broken" &&
          /^Verifica manuale:/i.test(e.text))),
  );
}
