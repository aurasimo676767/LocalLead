import { describe, expect, it } from "vitest";
import { newLead, defaultPreferences, type Lead } from "@/lib/model";
import {
  buildOutreachContext,
  fallbackMessage,
  platformPrefix,
} from "@/lib/messaging";
import {
  buildMessagePayload,
  validateOutreachMessage,
} from "@/lib/messaging/validation";
import { outreachInstructions } from "@/lib/messaging/prompt";
import { demoLeads } from "@/lib/demo";

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
    url: "https://www.booking.com/hotel/it/casa-sole.html",
    confidence: 0.9,
  });
  return l;
};

describe("lodging outreach context", () => {
  it("names the portal as the reason", () => {
    const context = buildOutreachContext(bnb(), defaultPreferences);
    expect(context.reasonKind).toBe("portal_only");
    expect(context.contactReason).toContain("Booking");
    expect(context.suggestedFeatures).not.toContain("menu");
    expect(context.suggestedFeatures).not.toContain("QR code");
  });
  it("ignores food-only reasons for lodging", () => {
    const l = newLead({ name: "Casa Sole", city: "Vittoria", category: "B&B" });
    l.analysis.evidence.push({
      id: "ads",
      kind: "menu_ads",
      text: "4 blocchi pubblicitari",
      url: "https://example.com/menu",
      confidence: 0.9,
    });
    expect(buildOutreachContext(l, defaultPreferences).status).toBe(
      "insufficient_outreach_context",
    );
  });
  it("recommends rooms, position and contacts instead of menu and QR", () => {
    const payload = buildMessagePayload(bnb(), defaultPreferences, [], "");
    expect(payload.lead.recommendedFeatures).toEqual([
      "foto",
      "posizione",
      "contatti",
    ]);
    expect(payload.lead.menuRelevant).toBe(false);
    expect(payload.lead.qrRelevant).toBe(false);
  });
});

describe("lodging fallback and validation", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "variant %i is valid and lodging-specific",
    (i) => {
      const text = fallbackMessage(bnb(), defaultPreferences, i);
      expect(text).not.toBe("");
      expect(text).not.toMatch(/men[uù]|\bqr\b/i);
      expect(text).toMatch(/b&b e case vacanza/i);
      expect(
        validateOutreachMessage(text, bnb(), defaultPreferences).errors,
      ).toEqual([]);
    },
  );
  it("allows direct booking for lodging but never commission figures", () => {
    const base = fallbackMessage(bnb(), defaultPreferences, 0);
    // The middle line carries the offer in the short format.
    const lines = base.split("\n");
    lines[1] =
      "vi farei un sito vostro con le foto delle camere, così chi vi trova su google può prenotare direttamente";
    expect(
      validateOutreachMessage(lines.join("\n"), bnb(), defaultPreferences)
        .errors,
    ).toEqual([]);
    lines[1] =
      "vi farei un sito vostro con le foto delle camere, così risparmiate le commissioni del 15 per cento";
    expect(
      validateOutreachMessage(lines.join("\n"), bnb(), defaultPreferences)
        .valid,
    ).toBe(false);
  });
  it("still forbids bookings in messages to food venues", () => {
    const lead = demoLeads()[0];
    const text = fallbackMessage(lead, defaultPreferences).replace(
      /\n([^\n]*)$/,
      " e le prenotazioni online\n$1",
    );
    expect(validateOutreachMessage(text, lead, defaultPreferences).valid).toBe(
      false,
    );
  });
  it("keeps a valid food fallback when the website is Tripadvisor", () => {
    const lead = newLead({
      name: "Trattoria Test",
      city: "Vittoria",
      category: "Ristorante",
      website_url: "https://www.tripadvisor.it/Restaurant_Review-x.html",
      website_status: "external_page_only",
    });
    lead.analysis.evidence.push({
      id: "e1",
      kind: "no_website",
      text: `${platformPrefix} la pagina Tripadvisor`,
      url: lead.website_url,
      confidence: 0.9,
    });
    const text = fallbackMessage(lead, defaultPreferences);
    expect(text).not.toBe("");
    expect(
      validateOutreachMessage(text, lead, defaultPreferences).errors,
    ).toEqual([]);
  });
});

describe("lodging instructions", () => {
  it("describes the sender's work and the offer for lodging", () => {
    const context = buildOutreachContext(bnb(), defaultPreferences);
    const text = outreachInstructions(
      defaultPreferences,
      0,
      context,
      false,
      { reach: "same", km: 0 },
      "alloggi",
    );
    expect(text).toContain("b&b e case vacanza");
    expect(text).toContain("prenotino direttamente");
    expect(text).toContain("mai con percentuali o cifre");
    expect(text).not.toContain("QR ai tavoli");
    expect(text).not.toContain("Non proporre prenotazioni online");
  });
  it("keeps the food instructions unchanged", () => {
    const lead = demoLeads()[0];
    const context = buildOutreachContext(lead, defaultPreferences);
    const text = outreachInstructions(defaultPreferences, 0, context);
    expect(text).toContain("Non proporre prenotazioni online");
    expect(text).toContain("faccio siti per i locali");
  });
});

describe("the contact reason must name the platform", () => {
  const reasonError = (text: string, lead: Lead) =>
    validateOutreachMessage(text, lead, defaultPreferences).errors.some((e) =>
      e.startsWith("Il motivo del contatto"),
    );
  it("rejects a lodging draft that never names the portal, even with 'subito'", () => {
    const lead = bnb();
    // "subito" right after "sito": the everyday word must not count as Subito.it.
    const lines = fallbackMessage(lead, defaultPreferences, 0).split("\n");
    lines[0] =
      "ciao buongiorno! vi ho trovati su google e come sito c'è solo una pagina, si vede subito";
    const text = lines.join("\n").replace(/Booking/g, "di un portale");
    expect(text).toMatch(/subito/i);
    expect(reasonError(text, lead)).toBe(true);
  });
  it("rejects a food draft that never names Facebook, even with 'subito'", () => {
    const lead = newLead({
      name: "Pizzeria Test",
      city: "Vittoria",
      category: "Pizzeria",
      website_url: "https://www.facebook.com/pizzeriatest",
      website_status: "social_only",
    });
    lead.analysis.evidence.push({
      id: "e1",
      kind: "no_website",
      text: `${platformPrefix} la pagina Facebook`,
      url: lead.website_url,
      confidence: 0.9,
    });
    const lines = fallbackMessage(lead, defaultPreferences).split("\n");
    lines[1] =
      "ho visto su google che come sito c'è solo una pagina, e chi vi cerca vuole vedere subito il menu";
    const text = lines.join("\n").replace(/facebook/gi, "una pagina");
    expect(text).toMatch(/subito/i);
    expect(reasonError(text, lead)).toBe(true);
  });
  it("still writes valid drafts for a Subito.it listing", () => {
    const lead = bnb();
    lead.website_url = "https://www.subito.it/case-vacanza/x.htm";
    lead.analysis.evidence[0].text = `${platformPrefix} la pagina Subito.it`;
    expect(
      [0, 1, 2, 3, 4, 5].some(
        (i) =>
          validateOutreachMessage(
            fallbackMessage(lead, defaultPreferences, i),
            lead,
            defaultPreferences,
          ).valid,
      ),
    ).toBe(true);
  });
});

describe("lodging prompt has no food wording", () => {
  it.each([
    { reach: "same", km: 0 },
    { reach: "near", km: 20 },
    { reach: "far", km: 120 },
  ] as const)("distance $reach", (distance) => {
    const context = buildOutreachContext(bnb(), defaultPreferences);
    const text = outreachInstructions(
      defaultPreferences,
      0,
      context,
      false,
      distance,
      "alloggi",
    );
    expect(text).not.toMatch(/menu, QR/);
    expect(text).not.toMatch(/il locale su Google/i);
    expect(text).not.toMatch(/Il locale è lontano/);
    expect(text).not.toMatch(/siti per locali/);
  });
});
