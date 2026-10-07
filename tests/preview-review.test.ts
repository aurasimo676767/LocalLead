import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categories,
  defaultPreferences,
  newLead,
  type Lead,
} from "@/lib/model";
import { fallbackMessage } from "@/lib/messaging";
import { validateOutreachMessage } from "@/lib/messaging/validation";
import { demoLeads, demoWorkspace } from "@/lib/demo";
import {
  copyProblems,
  fallbackCopy,
  isPreviewBot,
  placeLabel,
  previewLink,
} from "@/lib/site-preview";
import { settingsPreferences } from "@/lib/validation";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse: mocks.parse };
  },
}));
import { generateSiteCopy } from "@/lib/ai/site-copy";
import { generateOutreachMessage } from "@/lib/ai";

const preview = {
  slug: "demox1234567",
  views: 0,
  last_viewed_at: null,
  expires_at: "2099-01-01T00:00:00.000Z",
};
const valid = (lead: Lead) =>
  Array.from({ length: 30 }, (_, i) =>
    fallbackMessage(lead, defaultPreferences, i),
  ).filter((t) => validateOutreachMessage(t, lead, defaultPreferences).valid)
    .length;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("a link needs an absolute address", () => {
  it("gives no link without a configured address, so drafts still work", () => {
    for (const lead of demoWorkspace().leads.filter((l) => l.preview)) {
      expect(previewLink(lead)).toBe("");
      expect(valid(lead)).toBeGreaterThan(0);
    }
  });
  it("gives no link for an address without a scheme", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "simone-siti.vercel.app");
    expect(previewLink({ ...demoLeads()[0], preview })).toBe("");
  });
  it("gives no link for an opted-out lead", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://simone-siti.vercel.app");
    expect(
      previewLink({ ...demoLeads()[0], preview, do_not_contact: true }),
    ).toBe("");
  });
});

describe("the link does not eat the line budget", () => {
  it("keeps as many valid drafts with a long address as without a link", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://clientiai2-xlsq8y68w-aurasimo676767s-projects.vercel.app",
    );
    for (const lead of demoLeads().filter((l) =>
      fallbackMessage(l, defaultPreferences),
    )) {
      const plain = { ...lead, is_demo: false, preview: null };
      const linked = { ...lead, is_demo: false, preview };
      expect(valid(linked)).toBeGreaterThanOrEqual(valid(plain) - 2);
    }
  });
});

describe("time budget", () => {
  it("stops the preview copy at the first timeout", async () => {
    vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
    const error = new Error("Request timed out.");
    error.name = "APIConnectionTimeoutError";
    mocks.parse.mockRejectedValue(error);
    await generateSiteCopy(
      newLead({ name: "x", city: "Vittoria", category: "Bar" }),
    );
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect(mocks.parse.mock.calls[0][1].timeout).toBeLessThanOrEqual(10_000);
  });
  it("counts the draft's time from the start of the request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
    const lead = { ...demoLeads()[0], is_demo: false };
    const result = await generateOutreachMessage(
      lead,
      defaultPreferences,
      [],
      Date.now() - 44_500,
    );
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(result.model).toBe("fallback locale");
  });
});

describe("invented facts in preview copy", () => {
  const ok = fallbackCopy(
    newLead({ name: "x", city: "Vittoria", category: "Pizzeria" }),
  );
  it.each([
    "La pizza più gustosa di sempre, passate a trovarci!",
    "Il posto più bello della città, vi aspettiamo qui!",
    "Una pizza buonissima vi aspetta, passate quando volete!",
    "Impasto a lunga lievitazione e mozzarella fresca per tutti!",
    "Le ricette della nonna, come una volta, vi aspettano qui!",
    "Con vista sul porto, passate a trovarci quando volete!",
    "Colazione inclusa e parcheggio gratuito per tutti voi!",
    "Wifi in camera e piscina, vi aspettiamo con il sorriso!",
    "Dal millenovecento accogliamo chi passa da queste parti!",
  ])("rejects %s", (intro) =>
    expect(copyProblems({ ...ok, intro }).length).toBeGreaterThan(0),
  );
});

describe("hand-written copy reads like a person wrote it", () => {
  const expected: Record<string, string> = {
    Pizzeria: "la nostra pizzeria",
    Bar: "il nostro bar",
    Pub: "il nostro pub",
    Ristorante: "il nostro ristorante",
    Panificio: "il nostro panificio",
    "Cocktail bar": "il nostro cocktail bar",
    "Altro food": "il nostro locale",
    "B&B": "il nostro b&b",
    "Casa vacanza": "la nostra casa vacanze",
  };
  it.each(Object.entries(expected))(
    "%s uses the right article",
    (category, words) => {
      const all = [0, 1, 2]
        .map((v) =>
          JSON.stringify(
            fallbackCopy(
              newLead({
                name: "x",
                city: "Vittoria",
                category: category as Lead["category"],
              }),
              v,
            ),
          ),
        )
        .join(" ")
        .toLocaleLowerCase("it");
      expect(all).toContain(words);
      expect(all).not.toMatch(
        /la nostra (?:bar|pub|ristorante|panificio|cocktail bar|b&b)|la vostra b&b|altro food/,
      );
    },
  );
  it("still passes the copy checks for every category", () => {
    for (const category of categories)
      for (let v = 0; v < 6; v++)
        expect(
          copyProblems(
            fallbackCopy(newLead({ name: "x", city: "Vittoria", category }), v),
          ),
        ).toEqual([]);
  });
  it("varies between leads instead of always using the first variant", async () => {
    const titles = new Set<string>();
    for (let i = 0; i < 12; i++)
      titles.add(
        (
          await generateSiteCopy(
            newLead({ name: `Bar ${i}`, city: "Vittoria", category: "Bar" }),
          )
        ).title,
      );
    expect(titles.size).toBeGreaterThan(1);
  });
  it("never shows the internal category label", () => {
    expect(placeLabel("Altro food")).toBe("Locale");
    expect(placeLabel("Pizzeria")).toBe("Pizzeria");
  });
});

describe("real visitors are counted", () => {
  it.each([
    "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 Telegram-Android/11.2.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [LinkedInApp]/9.30",
    "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 WhatsApp/2.24.20",
  ])("counts in-app browser %#", (ua) => expect(isPreviewBot(ua)).toBe(false));
  it.each([
    "WhatsApp/2.23.20.0 A",
    "TelegramBot (like TwitterBot)",
    "LinkedInBot/1.0",
  ])("skips link unfurler %s", (ua) => expect(isPreviewBot(ua)).toBe(true));
});

describe("settings shown to prospects", () => {
  it("never saves a zero price", () =>
    expect(() => settingsPreferences({ site_price: 0 })).toThrow());
});

describe("no emoji before the link", () => {
  it.each(["👇🏽", "🇮🇹", "1️⃣"])("rejects %s right before the link", (emoji) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://simone-siti.vercel.app");
    const lead = { ...demoLeads()[0], is_demo: false, preview };
    const link = previewLink(lead);
    const text = fallbackMessage(lead, defaultPreferences).replace(
      ` ${link}`,
      ` ${emoji} ${link}`,
    );
    expect(
      validateOutreachMessage(text, lead, defaultPreferences).errors.join(" "),
    ).toMatch(/emoji/);
  });
});
