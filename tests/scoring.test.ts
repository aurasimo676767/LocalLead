import { describe, expect, it } from "vitest";
import { scoreLead, scoreParts } from "@/lib/scoring";
import {
  newLead,
  defaultPreferences,
  type Evidence,
  type Lead,
} from "@/lib/model";
import { platformPrefix } from "@/lib/messaging";

const ev = (kind: string, text = kind): Evidence => ({
  id: `${kind}-id`,
  kind,
  text,
  url: "https://maps.google.com/x",
  confidence: 0.9,
});
const places = (l: Lead) => {
  l.sources.push({
    id: "places-src",
    source_type: "google_places",
    url: "https://maps.google.com/x",
    confidence: 0.95,
    metadata_json: {},
    created_at: "",
  });
  return l;
};
const noSite = (fields: Partial<Lead> = {}) =>
  newLead({
    name: "Pizzeria Test",
    city: "Comiso",
    category: "Pizzeria",
    website_status: "none",
    ...fields,
    analysis: {
      ...newLead({ name: "x", city: "x", category: "Bar" }).analysis,
      evidence: [ev("no_website")],
    },
  });

describe("need", () => {
  it("counts only the strongest need, never the same fact twice", () => {
    const l = noSite();
    l.analysis.evidence.push(ev("website_missing"));
    const s = scoreLead(l);
    expect(scoreParts(s).need).toBe(50);
    expect(
      s.analysis.reasons.filter((r) => r.group === "need" && r.points > 0),
    ).toHaveLength(1);
  });
  it("gives a portal-only site the top need, named after the portal", () => {
    const l = newLead({
      name: "Casa Sole",
      city: "Comiso",
      category: "B&B",
      website_status: "external_page_only",
      website_url: "https://www.booking.com/hotel/it/x.html",
    });
    l.analysis.evidence.push(
      ev("no_website", `${platformPrefix} la pagina Booking`),
    );
    const s = scoreLead(l);
    expect(scoreParts(s).need).toBe(50);
    expect(s.main_problem).toBe("Come sito c'è solo la pagina Booking");
  });
  it("ranks social-only, unverified and weak sites below a verified absence", () => {
    const social = noSite({ website_status: "social_only" });
    expect(scoreParts(scoreLead(social)).need).toBe(45);
    const unverified = newLead({ name: "x", city: "x", category: "Bar" });
    unverified.analysis.evidence.push(ev("website_missing"));
    expect(scoreParts(scoreLead(unverified)).need).toBe(35);
    const weak = newLead({
      name: "x",
      city: "x",
      category: "Bar",
      website_status: "own_website",
      website_quality: "poor",
    });
    weak.analysis.evidence.push(ev("weak_website"));
    expect(scoreParts(scoreLead(weak)).need).toBe(30);
  });
  it("ignores menu ads and events for lodging", () => {
    const l = newLead({ name: "x", city: "x", category: "B&B" });
    l.analysis.evidence.push(ev("menu_ads"), ev("events"));
    l.analysis.events_relevant = true;
    expect(scoreParts(scoreLead(l)).need).toBe(0);
  });
});

describe("reach", () => {
  it("rates verified WhatsApp above a mobile number", () => {
    const wa = noSite({ whatsapp_confidence: "confirmed_business" });
    wa.analysis.evidence.push(ev("whatsapp"));
    expect(scoreParts(scoreLead(wa)).reach).toBe(30);
    const mobile = places(noSite({ phone: "+393331234567" }));
    expect(scoreParts(scoreLead(mobile)).reach).toBe(22);
  });
  it("gives no reach points without a source for the number", () => {
    expect(scoreParts(scoreLead(noSite({ phone: "+393331234567" }))).reach).toBe(
      0,
    );
  });
  it("rates social-only and landline contacts low", () => {
    const fb = noSite({ facebook_url: "https://facebook.com/x" });
    fb.analysis.evidence.push(ev("facebook_active"));
    expect(scoreParts(scoreLead(fb)).reach).toBe(12);
    const landline = places(noSite({ phone: "+390932123456" }));
    expect(scoreParts(scoreLead(landline)).reach).toBe(5);
  });
});

describe("activity", () => {
  it.each([
    [120, 12],
    [20, 8],
    [3, 2],
    [0, 0],
  ])("%i reviews give %i points", (reviews, points) => {
    const l = places(noSite({ reviews_count: reviews }));
    expect(scoreParts(scoreLead(l)).activity).toBe(points);
  });
  it("adds active socials and closeness to the sender", () => {
    const l = places(noSite({ reviews_count: 120, city: "Vittoria" }));
    l.analysis.evidence.push(ev("facebook_active"));
    expect(scoreParts(scoreLead(l)).activity).toBe(16);
    expect(scoreParts(scoreLead(l, defaultPreferences)).activity).toBe(20);
  });
  it("never scores reach or activity without a need", () => {
    const l = places(newLead({ name: "x", city: "Vittoria", category: "Bar" }));
    l.reviews_count = 1321;
    l.phone = "+393331234567";
    const s = scoreLead(l, defaultPreferences);
    expect(s.analysis.reasons).toEqual([]);
    expect(s.lead_score).toBe(0);
  });
});

describe("caps and penalties", () => {
  it("caps good and excellent sites", () => {
    const base = () => {
      const l = places(
        newLead({
          name: "x",
          city: "Vittoria",
          category: "Bar",
          website_status: "own_website",
          phone: "+393331234567",
          reviews_count: 200,
        }),
      );
      l.analysis.evidence.push(ev("site_ads"), ev("facebook_active"));
      return l;
    };
    expect(scoreLead({ ...base(), website_quality: "good" }).lead_score).toBe(25);
    expect(
      scoreLead({ ...base(), website_quality: "excellent" }).lead_score,
    ).toBe(15);
  });
  it("scores opted-out and closed leads zero", () => {
    expect(scoreLead({ ...noSite(), do_not_contact: true }).lead_score).toBe(0);
  });
  it("cites a source for every positive point", () => {
    const l = places(noSite({ phone: "+393331234567", reviews_count: 80 }));
    const s = scoreLead(l, defaultPreferences);
    expect(
      s.analysis.reasons
        .filter((r) => r.points > 0)
        .every((r) => r.evidence_ids.length > 0),
    ).toBe(true);
  });
  it("is idempotent, so rescoring saved leads changes nothing more", () => {
    const l = places(noSite({ phone: "+393331234567", reviews_count: 80 }));
    const once = scoreLead(l, defaultPreferences);
    expect(scoreLead(once, defaultPreferences)).toEqual(once);
  });
});
