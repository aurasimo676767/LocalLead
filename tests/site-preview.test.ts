import { afterEach, describe, expect, it, vi } from "vitest";
import { categories, newLead, type Lead } from "@/lib/model";
import {
  copyProblems,
  fallbackCopy,
  interestUrl,
  isPreviewBot,
  newSlug,
  previewLink,
  siteContent,
} from "@/lib/site-preview";

const lead = (extra: Partial<Lead> = {}) =>
  newLead({
    name: "Pizzeria Da Test",
    city: "Vittoria",
    category: "Pizzeria",
    address: "Via Roma 12, Vittoria",
    phone: "+393331234567",
    notes: "nota privata",
    ...extra,
  });
const future = new Date(Date.now() + 86_400_000).toISOString();
afterEach(() => vi.unstubAllEnvs());

describe("links", () => {
  it("makes short random slugs", () => {
    const slugs = new Set(Array.from({ length: 1000 }, () => newSlug()));
    expect(slugs.size).toBe(1000);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]{12}$/);
  });
  it("links only a live preview, on the neutral site address", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://simone-siti.vercel.app/");
    expect(previewLink(lead())).toBe("");
    const preview = {
      slug: "abcdef123456",
      views: 0,
      last_viewed_at: null,
      expires_at: future,
    };
    expect(previewLink(lead({ preview }))).toBe(
      "https://simone-siti.vercel.app/s/abcdef123456",
    );
    expect(
      previewLink(
        lead({ preview: { ...preview, expires_at: "2020-01-01T00:00:00Z" } }),
      ),
    ).toBe("");
  });
});

describe("public content", () => {
  it("copies only public facts", () => {
    const l = lead();
    l.analysis.evidence.push({
      id: "x",
      kind: "no_website",
      text: "segreto",
      url: "https://example.com",
      confidence: 0.9,
    });
    const content = siteContent(l, fallbackCopy(l));
    const json = JSON.stringify(content);
    for (const secret of ["nota privata", "segreto", "lead_score", "analysis"])
      expect(json).not.toContain(secret);
    expect(content.name).toBe("Pizzeria Da Test");
    expect(content.address).toBe("Via Roma 12, Vittoria");
    expect(content.sector).toBe("locali");
  });
});

describe("friendly copy without invented facts", () => {
  const ok = {
    title: "La pizza come piace a noi",
    intro: "Passa quando vuoi, ti aspettiamo con tanta voglia di chiacchierare!",
    offer: "Dai un'occhiata al menu con calma e scegli la tua, poi chiamaci o vieni direttamente.",
    contact: "Per qualsiasi cosa chiamaci, ti rispondiamo volentieri.",
  };
  it("accepts a casual text with no facts", () =>
    expect(copyProblems(ok)).toEqual([]));
  it.each([
    ["intro", "Siamo qui dal 1985, passa a trovarci quando vuoi tu!"],
    ["title", "La pizza più buona della città"],
    ["intro", "Cuociamo tutto nel nostro forno a legna, passa a trovarci!"],
    ["intro", "Siamo a due passi dal mare, passa a trovarci quando vuoi!"],
    ["contact", "Abbiamo 4,8 stelle su Google, chiamaci quando vuoi!"],
    ["title", "Un titolo davvero lunghissimo che non entra mai nella prima schermata"],
  ] as const)("rejects %s: %s", (field, text) =>
    expect(copyProblems({ ...ok, [field]: text }).length).toBeGreaterThan(0),
  );
  it("ships fallback copy that passes for every category and variant", () => {
    for (const category of categories)
      for (let i = 0; i < 6; i++) {
        const copy = fallbackCopy(lead({ category }), i);
        expect(copyProblems(copy)).toEqual([]);
        if (category === "B&B" || category === "Casa vacanza")
          expect(JSON.stringify(copy)).not.toMatch(/men[uù]/i);
      }
  });
});

describe("visitors", () => {
  it.each([
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1",
    "TelegramBot (like TwitterBot)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1)",
    "",
  ])("treats %j as a bot", (ua) => expect(isPreviewBot(ua)).toBe(true));
  it("counts a phone browser", () =>
    expect(
      isPreviewBot(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
      ),
    ).toBe(false));
  it("opens WhatsApp to the sender with a ready text", () => {
    const url = interestUrl("+393331234567", "Simone", "Pizzeria X");
    expect(url).toContain("api.whatsapp.com/send?phone=393331234567");
    expect(decodeURIComponent(url)).toContain(
      "Ciao Simone, ho visto l'anteprima del sito per Pizzeria X",
    );
    expect(interestUrl("", "Simone", "Pizzeria X")).toBe("");
  });
});
