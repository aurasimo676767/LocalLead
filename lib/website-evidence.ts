import type { Lead } from "./model";

// Older analyses stored local network errors as website_unreachable.
// Only an actual HTTP failure is evidence suitable for an outreach claim.
export function websiteFailureEvidence(lead: Lead) {
  return lead.analysis.evidence.find(
    (e) =>
      e.kind === "website_unreachable" &&
      e.confidence >= 0.7 &&
      !!e.url &&
      /\bHTTP\s+(?:404|410|5\d{2})\b/i.test(e.text),
  );
}
