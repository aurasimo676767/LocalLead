import { describe, expect, it } from "vitest";
import { demoLeads } from "../lib/demo";
import { defaultPreferences } from "../lib/model";
import { fallbackMessage, senderReach } from "../lib/messaging";
import {
  buildMessagePayload,
  validateOutreachMessage,
} from "../lib/messaging/validation";

describe("outreach final validation", () => {
  it("rejects generic copy, missing menu, missing QR and CTA-only regeneration", () => {
    const lead = demoLeads()[0];
    const good = fallbackMessage(lead, defaultPreferences);
    expect(validateOutreachMessage(good, lead, defaultPreferences).valid).toBe(
      true,
    );
    for (const text of [
      "ciao, mi occupo di siti per locali della zona e posso farvene uno con prodotti foto e contatti\nvi interesserebbe?",
      good.replace(/menu/gi, "prodotti"),
      good.replace(/, poi ai tavoli[^\n]*/, ""),
    ])
      expect(
        validateOutreachMessage(text, lead, defaultPreferences).valid,
      ).toBe(false);
    expect(
      validateOutreachMessage(
        good.replace(/Vi interesserebbe\?/, "Che ne pensate?"),
        lead,
        defaultPreferences,
        [good],
      ).valid,
    ).toBe(false);
  });
  it("uses saved context and defaults food menus without inventing events or photo quality", () => {
    const lead = demoLeads()[0];
    lead.category = "Gastronomia";
    lead.analysis.events_relevant = false;
    const payload = buildMessagePayload(
      lead,
      defaultPreferences,
      ["recent"],
      "previous",
    );
    expect(payload.lead.menuRelevant).toBe(true);
    expect(payload.lead.qrRelevant).toBe(false);
    expect(payload.lead.eventsRelevant).toBe(false);
    expect(payload.lead.mainProblem).toBe(lead.main_problem);
    expect(payload.lead.aiSummary).toBe(lead.ai_summary);
    expect(payload.previousMessage).toBe("previous");
    expect(payload.recentGeneratedMessages).toEqual(["recent"]);
  });
  it("regenerates with different wording on every line", () => {
    const lead = demoLeads()[0];
    for (let i = 0; i < 12; i++) {
      const a = fallbackMessage(lead, defaultPreferences, i).split("\n");
      const b = fallbackMessage(lead, defaultPreferences, i + 1).split("\n");
      expect(a.filter((line, n) => line === b[n])).toEqual([]);
    }
  });
});

describe("sender distance", () => {
  // Vittoria (RG), located once through Places.
  const home = {
    ...defaultPreferences,
    sender_place: "Vittoria",
    sender_lat: 36.953,
    sender_lng: 14.532,
  };
  const ready = demoLeads().find(
    (l) => fallbackMessage(l, defaultPreferences) !== "",
  )!;
  const at = (
    city: string,
    latitude: number | null,
    longitude: number | null,
  ) => ({
    ...ready,
    city,
    latitude,
    longitude,
  });
  const local = /della zona|in zona|abito|vicino|non lontano/i;
  it("never claims to be nearby for a venue 1000 km away", () => {
    const livorno = at("Livorno", 43.548, 10.311);
    expect(senderReach(livorno, home)).toEqual({ reach: "far", km: 816 });
    for (let i = 0; i < 12; i++) {
      const text = fallbackMessage(livorno, home, i);
      expect(text).not.toMatch(local);
      expect(validateOutreachMessage(text, livorno, home).valid, text).toBe(
        true,
      );
    }
    const claimed = fallbackMessage(ready, home).replace(
      /mi chiamo Simone[^\n]*/,
      "mi chiamo Simone e abito a Vittoria qui vicino a voi",
    );
    expect(validateOutreachMessage(claimed, livorno, home).valid).toBe(false);
  });
  it("keeps the local wording for the same town and nearby towns", () => {
    expect(fallbackMessage(ready, home)).toMatch(/abito anche io a Vittoria/);
    const comiso = at("Comiso", 36.949, 14.607);
    expect(senderReach(comiso, home).reach).toBe("near");
    expect(fallbackMessage(comiso, home, 1)).toMatch(/abito a Vittoria/);
  });
  it("treats another town as far when either position is unknown", () => {
    expect(senderReach(at("Comiso", null, null), home).reach).toBe("far");
    expect(
      senderReach(at("Comiso", 36.949, 14.607), defaultPreferences).reach,
    ).toBe("far");
  });
});
