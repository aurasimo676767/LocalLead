import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences, newLead, type Lead } from "@/lib/model";
import {
  buildOutreachContext,
  fallbackMessage,
  platformPrefix,
} from "@/lib/messaging";
import { validateOutreachMessage } from "@/lib/messaging/validation";
import { outreachInstructions } from "@/lib/messaging/prompt";
import { demoLeads } from "@/lib/demo";

const site = "https://simone-siti.vercel.app";
const preview = {
  slug: "abcdefghij12",
  views: 0,
  last_viewed_at: null,
  expires_at: "2099-01-01T00:00:00.000Z",
};
const link = `${site}/s/${preview.slug}`;
const bnb = (): Lead => {
  const l = newLead({
    name: "Casa Sole",
    city: "Vittoria",
    category: "B&B",
    website_url: "https://www.booking.com/hotel/it/casa-sole.html",
    website_status: "external_page_only",
  });
  l.analysis.evidence.push({
    id: "e1",
    kind: "no_website",
    text: `${platformPrefix} la pagina Booking`,
    url: l.website_url,
    confidence: 0.9,
  });
  return l;
};
const leads = () => [
  ...demoLeads()
    .filter((l) => fallbackMessage(l, defaultPreferences))
    .map((l) => ({ ...l, is_demo: false })),
  bnb(),
];
const salesy =
  /più facile che|vendit|fa (?:davvero )?la differenza|più propens|metterei|ci metterei|mi occupo della realizzazione/i;
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", site));
afterEach(() => vi.unstubAllEnvs());

describe("a short first message, not a sales pitch", () => {
  it.each([0, 1, 2, 3])(
    "variant %i with a preview: 3 lines, link in the middle",
    (v) => {
      for (const lead of leads()) {
        const l = { ...lead, preview };
        const text = fallbackMessage(l, defaultPreferences, v);
        const lines = text.split("\n");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toMatch(/^ciao/i);
        expect(lines[1]).toContain(`date un'occhiata ${link}`);
        expect(lines[2]).toMatch(/sono Simone/);
        expect(text.replace(link, "").length).toBeLessThanOrEqual(400);
        expect(text).not.toMatch(salesy);
        expect(
          validateOutreachMessage(text, l, defaultPreferences).errors,
        ).toEqual([]);
      }
    },
  );
  it.each([0, 1, 2, 3])(
    "variant %i without a preview: still short and valid",
    (v) => {
      for (const l of leads()) {
        const text = fallbackMessage(l, defaultPreferences, v);
        expect(text.split("\n")).toHaveLength(3);
        expect(text.length).toBeLessThanOrEqual(450);
        expect(text).not.toMatch(/https?:/);
        expect(
          validateOutreachMessage(text, l, defaultPreferences).errors,
        ).toEqual([]);
      }
    },
  );
});

describe("validation of the short format", () => {
  const lead = () => ({ ...demoLeads()[0], is_demo: false, preview });
  const good =
    `ciao buongiorno! cercando su google non ho trovato un sito vostro, c'è solo la pagina facebook\n` +
    `per curiosità ho provato a fare un'anteprima di come potrebbe venire, date un'occhiata ${link}\n` +
    `sono Simone, faccio siti per i locali qui a Vittoria, che ne dite? 🙂`;
  it("accepts a short draft without menu or QR", () =>
    expect(
      validateOutreachMessage(good, lead(), defaultPreferences).errors,
    ).toEqual([]));
  it("rejects the old five-line pitch", () => {
    const old = [
      "ciao buongiorno! mi chiamo Simone e abito anche io a Vittoria, mi occupo della realizzazione di siti web fatti su misura, specialmente per i locali della zona",
      "ho visto che non avete un sito (almeno, ho cercato su google ma non ho trovato nulla) dove far vedere il menu e le foto di quello che fate",
      "oggi quasi tutti prima di uscire guardano tutto dal telefono, e se trovano subito il menu e le foto è molto più facile che scelgano voi",
      `si potrebbe farne uno su misura come piace a voi, con le foto dei piatti, il menu, le foto del locale e la vostra storia se volete, date un'occhiata ${link}`,
      "vi interesserebbe?",
    ].join("\n");
    expect(validateOutreachMessage(old, lead(), defaultPreferences).valid).toBe(
      false,
    );
  });
  it("still asks who is writing", () =>
    expect(
      validateOutreachMessage(
        good.replace("sono Simone, ", ""),
        lead(),
        defaultPreferences,
      ).errors.join(" "),
    ).toMatch(/Simone/));
});

describe("instructions for the short format", () => {
  it("asks for three lines, the preview in the middle and the sender at the end", () => {
    const l = { ...demoLeads()[0], is_demo: false, preview };
    const text = outreachInstructions(
      defaultPreferences,
      0,
      buildOutreachContext(l, defaultPreferences),
      false,
      { reach: "same", km: 0 },
      "locali",
      link,
    );
    expect(text).toContain("3 righe");
    expect(text).toContain("sono Simone");
    expect(text).toContain(link);
    // The why-a-site line and the feature list are gone (only a "do not" remains).
    expect(text).not.toMatch(
      /400–750|Nella terza riga spiega|elenca in modo concreto/,
    );
  });
});

const ai = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse: ai.parse };
  },
}));
import { generateOutreachMessage } from "@/lib/ai";

describe("AI drafts in the short format", () => {
  it("accepts a draft that names no feature: the preview shows them", async () => {
    vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
    const lead = { ...demoLeads()[2], is_demo: false, preview };
    const message =
      `ciao buongiorno! cercandovi su google ho visto che fate il dj set ogni venerdì, ma un sito dove raccogliere le serate non c'è\n` +
      `per curiosità ho provato a fare un'anteprima di come potrebbe venire il vostro sito, date un'occhiata ${link}\n` +
      `sono Simone, faccio siti per i locali qui a Vittoria, che ne dite?`;
    ai.parse.mockResolvedValue({
      output_parsed: {
        message,
        reasonUsed: buildOutreachContext(lead, defaultPreferences).reasonKind,
        featuresUsed: [],
        evidence_ids: ["E1"],
      },
    });
    const result = await generateOutreachMessage(lead, defaultPreferences, []);
    expect(result.text).toBe(message);
    expect(ai.parse).toHaveBeenCalledTimes(1);
  });
});

describe("a way out for who doesn't open links", () => {
  it("offers photos right after the link, in brackets", () => {
    const l = { ...demoLeads()[0], is_demo: false, preview };
    const text = fallbackMessage(l, defaultPreferences, 0);
    expect(text).toContain(
      `${link} (se non vi fidate ad aprire il link vi mando qualche foto)`,
    );
    expect(validateOutreachMessage(text, l, defaultPreferences).errors).toEqual(
      [],
    );
    const plain = { ...l, preview: null };
    expect(fallbackMessage(plain, defaultPreferences, 0)).not.toContain(
      "vi mando qualche foto",
    );
  });
  it("asks the AI for the same brackets", () => {
    const l = { ...demoLeads()[0], is_demo: false, preview };
    const text = outreachInstructions(
      defaultPreferences,
      0,
      buildOutreachContext(l, defaultPreferences),
      false,
      { reach: "same", km: 0 },
      "locali",
      link,
    );
    expect(text).toContain(
      "(se non vi fidate ad aprire il link vi mando qualche foto)",
    );
  });
});
