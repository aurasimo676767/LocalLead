import type { Lead } from "./model";

// Older analyses stored local network errors as website_unreachable.
// Automated status codes can come from bot protection, a transient upstream
// or a stale URL. A broken-site outreach claim always requires a manual check.
export function websiteFailureEvidence(lead: Lead) {
  return lead.analysis.evidence.find(
    (e) =>
      e.kind === "website_unreachable" &&
      e.confidence >= 0.7 &&
      !!e.url &&
      lead.website_status === "broken" &&
      /^Verifica manuale:/i.test(e.text),
  );
}
