import { describe, expect, it } from "vitest";
import { demoLeads } from "../lib/demo";
import { defaultPreferences } from "../lib/model";
import { fallbackMessage } from "../lib/messaging";
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
