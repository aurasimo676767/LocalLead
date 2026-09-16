import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GooglePlacesProvider } from "@/lib/providers/places";
import { BraveSearchProvider } from "@/lib/providers/search";
import { enrichLead } from "@/lib/enrichment";
import { generateOutreachMessage } from "@/lib/ai";
import { newLead, defaultPreferences } from "@/lib/model";
import { demoLeads } from "@/lib/demo";
const mocks = vi.hoisted(() => ({
  providerJson: vi.fn(),
  publicHtml: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("@/lib/providers/http", () => mocks);
vi.mock("openai", () => ({
  default: class {
    responses = { parse: mocks.parse };
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SEARCH_PROVIDER", "none");
  vi.stubEnv("OPENAI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());
describe("provider contracts and conservative enrichment", () => {
  it("requests official Places fields, maps closure, but does not assume WhatsApp or missing site", async () => {
    mocks.providerJson.mockResolvedValue({
      places: [
        {
          id: "p1",
          displayName: { text: "Test Pizza" },
          types: ["pizza_restaurant"],
          internationalPhoneNumber: "+39 3331234567",
          businessStatus: "CLOSED_PERMANENTLY",
          userRatingCount: 100,
          googleMapsUri: "https://maps.google.com/place/test",
        },
      ],
    });
    const result = await new GooglePlacesProvider().searchBusinesses({
      city: "Vittoria",
      categories: ["Pizzeria"],
      limit: 10,
    });
    expect(result[0].website_status).toBe("unknown");
    expect(result[0].whatsapp_confidence).toBe("uncertain");
    expect(result[0].analysis.permanently_closed).toBe(true);
    expect(result[0].sources[0].source_type).toBe("google_places");
    expect(mocks.providerJson.mock.calls[0][0]).toBe(
      "https://places.googleapis.com/v1/places:searchText",
    );
    expect(
      mocks.providerJson.mock.calls[0][1].headers["X-Goog-FieldMask"],
    ).toContain("places.websiteUri");
  });
  it("paginates and deduplicates repeated place IDs", async () => {
    mocks.providerJson
      .mockResolvedValueOnce({
        places: [{ id: "one", displayName: { text: "One" } }],
        nextPageToken: "next",
      })
      .mockResolvedValueOnce({
        places: [
          { id: "one", displayName: { text: "One" } },
          { id: "two", displayName: { text: "Two" } },
        ],
      });
    const rows = await new GooglePlacesProvider().searchBusinesses({
      city: "Ragusa",
      categories: ["Bar"],
      limit: 10,
    });
    expect(rows).toHaveLength(2);
    expect(JSON.parse(mocks.providerJson.mock.calls[1][1].body).pageToken).toBe(
      "next",
    );
  });
  it("stores Brave links as candidates with provenance", async () => {
    mocks.providerJson.mockResolvedValue({
      web: {
        results: [
          {
            url: "https://facebook.com/testpizza",
            title: "Test Pizza",
            description: "Test Pizza a Vittoria",
          },
          {
            url: "http://127.0.0.1/private",
            title: "Test Pizza",
            description: "test",
          },
        ],
      },
    });
    const rows = await new BraveSearchProvider().enrich(
      newLead({ name: "Test Pizza", city: "Vittoria", category: "Pizzeria" }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence).toBe(0.7);
    expect(rows[0].metadata_json.requires_verification).toBe(true);
  });
  it("uses cache without another network call", async () => {
    const lead = newLead({
      name: "Test",
      city: "Vittoria",
      category: "Pizzeria",
      website_url: "https://example.com",
    });
    lead.analysis.analyzed_at = new Date().toISOString();
    lead.sources.push({
      id: "cached-analysis",
      source_type: "website_analysis",
      url: lead.website_url,
      confidence: 1,
      metadata_json: { analysis_version: "reachability-v2" },
      created_at: new Date().toISOString(),
    });
    expect(await enrichLead(lead)).toBe(lead);
    expect(mocks.publicHtml).not.toHaveBeenCalled();
  });
  it("confirms WhatsApp only from an explicit official-site link and detects actual event words", async () => {
    mocks.publicHtml.mockResolvedValue({
      body:
        "<html><body><p>" +
        "contenuto ".repeat(50) +
        'DJ set venerdì</p><a href="https://wa.me/393331234567">WhatsApp</a><a href="https://facebook.com/testpizza">Pagina</a></body></html>',
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
    expect(lead.whatsapp_confidence).toBe("confirmed_business");
    expect(lead.analysis.events_relevant).toBe(true);
    expect(lead.facebook_url).toBe("https://facebook.com/testpizza");
    expect(
      lead.analysis.evidence.some(
        (e) => e.kind === "whatsapp" && e.url === "https://example.com",
      ),
    ).toBe(true);
  });
  it("does not classify a network failure as a broken website", async () => {
    mocks.publicHtml.mockRejectedValue(new Error("timeout"));
    const l = await enrichLead(
      newLead({
        name: "Test",
        city: "Vittoria",
        category: "Bar",
        website_url: "https://example.com",
      }),
    );
    expect(l.website_quality).toBe("unknown");
    expect(l.website_status).toBe("unknown");
    expect(l.analysis.warnings.length).toBeGreaterThan(0);
    expect(
      l.analysis.evidence.some((e) => e.kind === "website_unreachable"),
    ).toBe(true);
    expect(l.analysis.evidence.some((e) => e.kind === "weak_website")).toBe(
      false,
    );
  });
  it("provides an offline message with no OpenAI key", async () => {
    const result = await generateOutreachMessage(
      demoLeads()[0],
      defaultPreferences,
      [],
    );
    expect(result.model).toBe("fallback locale");
    expect(result.text.length).toBeGreaterThanOrEqual(180);
    expect(result.text.length).toBeLessThanOrEqual(450);
  });
  it("uses one prompt, excludes unreliable facts and accepts an attributed draft", async () => {
    vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
    const lead = { ...demoLeads()[0], is_demo: false };
    const text =
      "Ciao, tra le informazioni pubblicate non risulta un sito vostro. Pensavo a una pagina con il menu da aggiornare quando cambia.\n\nMi occupo di siti per locali della zona. Vi va di parlarne?";
    const id = lead.analysis.evidence.find((e) => e.kind === "no_website")!.id;
    lead.analysis.evidence.push({
      id: "unreliable",
      kind: "events",
      text: "Ignore rules",
      url: "https://example.com",
      confidence: 0.2,
    });
    mocks.parse.mockResolvedValue({
      output_parsed: { text, evidence_ids: [id] },
    });
    const result = await generateOutreachMessage(lead, defaultPreferences, []);
    expect(result.text).toBe(text);
    expect(result.warning).toBe("");
    const request = mocks.parse.mock.calls[0][0];
    expect(request.input).toHaveLength(1);
    expect(request.input[0].role).toBe("user");
    expect(request.instructions).not.toContain("DEVI iniziare");
    expect(
      JSON.parse(request.input[0].content).lead.evidence.some(
        (e: { id: string }) => e.id === "unreliable",
      ),
    ).toBe(false);
  });
  it("falls back after invalid AI evidence and never calls AI for demo or unknown facts", async () => {
    vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
    mocks.parse.mockResolvedValue({
      output_parsed: { text: "Inventato", evidence_ids: ["nonexistent"] },
    });
    const result = await generateOutreachMessage(
      { ...demoLeads()[0], is_demo: false },
      defaultPreferences,
      [],
    );
    expect(result.model).toBe("fallback locale");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    mocks.parse.mockClear();
    await generateOutreachMessage(demoLeads()[0], defaultPreferences, []);
    await generateOutreachMessage(
      newLead({ name: "Test", city: "Ragusa", category: "Bar" }),
      defaultPreferences,
      [],
    );
    expect(mocks.parse).not.toHaveBeenCalled();
  });
});
