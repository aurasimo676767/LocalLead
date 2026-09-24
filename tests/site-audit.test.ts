import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { siteFindings, siteQuality } from "@/lib/enrichment/audit";
import { enrichLead } from "@/lib/enrichment";
import { newLead, type SiteAudit } from "@/lib/model";
const mocks = vi.hoisted(() => ({
  auditWebsite: vi.fn(),
  saveScreen: vi.fn(),
  publicHtml: vi.fn(),
  providerJson: vi.fn(),
}));
vi.mock("@/lib/enrichment/browser", () => ({
  auditWebsite: mocks.auditWebsite,
  browserAuditEnabled: () => process.env.WEBSITE_BROWSER === "true",
}));
vi.mock("@/lib/enrichment/screens", () => ({ saveScreen: mocks.saveScreen }));
vi.mock("@/lib/providers/http", () => ({
  publicHtml: mocks.publicHtml,
  providerJson: mocks.providerJson,
}));
const clean: SiteAudit = {
  checked_at: "2026-09-24T10:00:00.000Z",
  final_url: "https://example.com/",
  status: 200,
  load_ms: 1800,
  requests: 40,
  https: true,
  title: "Pizzeria Test",
  description: "",
  word_count: 420,
  image_count: 12,
  broken_images: 0,
  copyright_year: 2026,
  technologies: ["WordPress"],
  ads: { slots: 0, networks: [] },
  popups: 0,
  cookie_banner: true,
  mobile: {
    viewport: true,
    page_width: 390,
    screen_width: 390,
    small_text_pct: 5,
  },
  menu: {
    links: ["https://example.com/menu"],
    pdf_only: false,
    on_page: false,
  },
  booking_links: [],
  ordering_links: [],
  whatsapp_link: false,
  tel_link: true,
  email_link: false,
  map_embed: true,
  social_links: [],
  parked: false,
  under_construction: false,
  console_errors: 0,
  screenshots: { desktop: true, mobile: true },
};
const audit = (patch: Partial<SiteAudit>): SiteAudit => ({
  ...structuredClone(clean),
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SEARCH_PROVIDER", "none");
  vi.stubEnv("OPENAI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());
describe("browser site findings", () => {
  it("rates a clean, complete homepage as good with no findings", () => {
    const findings = siteFindings(clean, 2026);
    expect(findings).toEqual([]);
    expect(siteQuality(clean, findings)).toBe("good");
  });
  it("counts visible ads and a layout wider than the phone as severe", () => {
    const a = audit({
      ads: { slots: 3, networks: ["Google Ads"] },
      mobile: {
        viewport: true,
        page_width: 980,
        screen_width: 390,
        small_text_pct: 0,
      },
    });
    const findings = siteFindings(a, 2026);
    expect(findings.find((f) => f.kind === "site_ads")?.text).toBe(
      "3 spazi pubblicitari visibili sulla homepage (Google Ads)",
    );
    expect(findings.some((f) => f.text.includes("980px su 390px"))).toBe(true);
    expect(siteQuality(a, findings)).toBe("poor");
  });
  it("keeps minor issues at average and an old copyright below scoring confidence of facts", () => {
    const a = audit({ copyright_year: 2019, popups: 1 });
    const findings = siteFindings(a, 2026);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => !f.severe)).toBe(true);
    expect(siteQuality(a, findings)).toBe("average");
  });
  it("treats a parked domain and an error status as problems, never as good", () => {
    const parked = audit({ parked: true, word_count: 30 });
    expect(siteQuality(parked, siteFindings(parked))).toBe("poor");
    const error = audit({ status: 500 });
    expect(siteQuality(error, siteFindings(error))).toBe("broken");
  });
  it("makes no phone claim when the phone visit was blocked", () => {
    const a = audit({ mobile: null });
    expect(siteFindings(a, 2026)).toEqual([]);
    expect(siteQuality(a, [])).toBe("good");
  });
  it("does not report ad scripts alone as visible ads", () => {
    const a = audit({ ads: { slots: 0, networks: ["Taboola"] } });
    const findings = siteFindings(a, 2026);
    expect(findings.some((f) => f.kind === "site_ads")).toBe(false);
    expect(findings[0].confidence).toBeLessThan(0.8);
  });
});
describe("enrichment with the browser check", () => {
  it("scores measured problems, saves screenshots and keeps the audit", async () => {
    vi.stubEnv("WEBSITE_BROWSER", "true");
    const a = audit({
      ads: { slots: 4, networks: ["Google Ads"] },
      mobile: {
        viewport: false,
        page_width: 980,
        screen_width: 390,
        small_text_pct: 40,
      },
    });
    mocks.auditWebsite.mockResolvedValue({
      audit: a,
      html: "<html><body><p>" + "contenuto ".repeat(300) + "</p></body></html>",
      desktop: Buffer.from("d"),
      mobile: Buffer.from("m"),
    });
    const lead = await enrichLead(
      newLead({
        name: "Test Pizza",
        city: "Vittoria",
        category: "Pizzeria",
        website_url: "https://example.com",
      }),
    );
    expect(mocks.publicHtml).not.toHaveBeenCalled();
    expect(lead.website_quality).toBe("poor");
    expect(lead.analysis.site_audit?.ads.slots).toBe(4);
    expect(lead.analysis.site_audit?.review).toBeNull();
    expect(mocks.saveScreen).toHaveBeenCalledTimes(2);
    const labels = lead.analysis.reasons.map((r) => r.label);
    expect(labels).toContain("Pubblicità sul sito");
    expect(labels).toContain("Sito migliorabile: criticità rilevate");
    expect(
      lead.analysis.evidence.find((e) => e.kind === "weak_website")?.text,
    ).toMatch(/^Controllo nel browser: /);
  });
  it("falls back to the HTML check when the browser cannot start", async () => {
    vi.stubEnv("WEBSITE_BROWSER", "true");
    mocks.auditWebsite.mockRejectedValue(new Error("Executable doesn't exist"));
    mocks.publicHtml.mockResolvedValue({
      body: "<html><body><p>" + "contenuto ".repeat(50) + "</p></body></html>",
      status: 200,
      url: "https://example.com",
      type: "text/html",
    });
    const lead = await enrichLead(
      newLead({
        name: "Test Pizza",
        city: "Vittoria",
        category: "Pizzeria",
        website_url: "https://example.com",
      }),
    );
    expect(mocks.publicHtml).toHaveBeenCalled();
    expect(lead.analysis.site_audit).toBeNull();
    expect(lead.analysis.features?.word_count).toBe(50);
  });
});
