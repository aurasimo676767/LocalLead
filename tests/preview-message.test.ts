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
  slug: "demox1234567",
  views: 0,
  last_viewed_at: null,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
};
const link = `${site}/s/${preview.slug}`;
const food = (): Lead => ({ ...demoLeads()[0], is_demo: false, preview });
const bnb = (): Lead => {
  const l = newLead({
    name: "Casa Sole",
    city: "Vittoria",
    category: "B&B",
    website_url: "https://www.booking.com/hotel/it/casa-sole.html",
    website_status: "external_page_only",
    preview,
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
const errors = (text: string, lead: Lead) =>
  validateOutreachMessage(text, lead, defaultPreferences).errors;
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", site));
afterEach(() => vi.unstubAllEnvs());

describe("the preview link in the draft", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "food variant %i carries the link once, cleanly",
    (i) => {
      const text = fallbackMessage(food(), defaultPreferences, i);
      expect(text.split(link)).toHaveLength(2);
      expect(text).toContain(`date un'occhiata ${link}`);
      expect(errors(text, food())).toEqual([]);
    },
  );
  it.each([0, 1, 2, 3, 4, 5])(
    "lodging variant %i carries the link once, cleanly",
    (i) => {
      const text = fallbackMessage(bnb(), defaultPreferences, i);
      expect(text).toContain(`date un'occhiata ${link}`);
      expect(errors(text, bnb())).toEqual([]);
    },
  );
  it("adds no link without a preview", () => {
    const lead = { ...food(), preview: null };
    expect(fallbackMessage(lead, defaultPreferences)).not.toMatch(/https?:/);
  });
});

describe("validation of the link", () => {
  const good = () => fallbackMessage(food(), defaultPreferences, 0);
  it("rejects a draft without the link", () =>
    expect(errors(good().replace(` ${link}`, ""), food()).join(" ")).toMatch(
      /link dell'anteprima/,
    ));
  it("rejects the link twice", () =>
    expect(
      errors(good().replace(link, `${link} ${link}`), food()).join(" "),
    ).toMatch(/link dell'anteprima/));
  it("rejects an emoji right before the link", () =>
    expect(
      errors(good().replace(` ${link}`, ` 👉 ${link}`), food()).join(" "),
    ).toMatch(/emoji/));
  it("rejects another link", () =>
    expect(
      errors(good().replace(link, "https://example.com/x"), food()).join(" "),
    ).toMatch(/link/));
  it("rejects any link when there is no preview", () => {
    const lead = { ...food(), preview: null };
    expect(errors(good(), lead).join(" ")).toMatch(/link/);
  });
  it("ignores the link's dots and words in the other checks", () => {
    // "demo" in the slug and the dots of the address are not the message's own.
    expect(errors(good(), food())).toEqual([]);
  });
});

describe("instructions for the AI", () => {
  it("passes the exact link and the no-emoji rule", () => {
    const context = buildOutreachContext(food(), defaultPreferences);
    const text = outreachInstructions(
      defaultPreferences,
      0,
      context,
      false,
      { reach: "same", km: 0 },
      "locali",
      link,
    );
    expect(text).toContain(link);
    expect(text).toContain("date un'occhiata");
    expect(text).toContain("senza emoji prima del link");
  });
  it("forbids links when there is no preview", () => {
    const context = buildOutreachContext(food(), defaultPreferences);
    expect(outreachInstructions(defaultPreferences, 0, context)).toContain(
      "Non inserire link",
    );
  });
});
