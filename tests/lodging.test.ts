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
  it.each([0, 1, 2, 3, 4, 5])("variant %i is valid and lodging-specific", (i) => {
    const text = fallbackMessage(bnb(), defaultPreferences, i);
    expect(text).not.toBe("");
    expect(text).not.toMatch(/men[uù]|\bqr\b/i);
    expect(text).toMatch(/b&b e case vacanza/i);
    expect(
      validateOutreachMessage(text, bnb(), defaultPreferences).errors,
    ).toEqual([]);
  });
  it("allows direct booking for lodging but never commission figures", () => {
    const base = fallbackMessage(bnb(), defaultPreferences, 0);
    const lines = base.split("\n");
    lines[2] =
      "con un sito vostro chi vi trova su google può prenotare direttamente, senza passare dalle commissioni dei portali";
    expect(
      validateOutreachMessage(lines.join("\n"), bnb(), defaultPreferences)
        .errors,
    ).toEqual([]);
    lines[2] =
      "con un sito vostro risparmiate le commissioni del 15 per cento dei portali";
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
    expect(text).toContain("specialmente per i locali");
  });
});
