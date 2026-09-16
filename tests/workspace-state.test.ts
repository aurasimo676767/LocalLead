import { describe, expect, it } from "vitest";
import { defaultPreferences, newLead } from "@/lib/model";
import { mergeWorkspaceResult } from "@/lib/workspace-state";

describe("workspace response updates", () => {
  it("merges changed records without losing concurrent updates or history", () => {
    const a = newLead({ name: "Locale A", city: "Ragusa", category: "Bar" });
    const b = newLead({ name: "Locale B", city: "Ragusa", category: "Bar" });
    const original = { leads: [a, b], preferences: defaultPreferences };
    const changed = {
      ...a,
      notes: "Modifica più recente",
      updated_at: "2099-01-01T00:00:00.000Z",
    };
    const first = mergeWorkspaceResult(original, { lead: changed });
    const second = mergeWorkspaceResult(first, {
      lead: { ...b, status: "contacted" },
    });
    const late = mergeWorkspaceResult(second, { lead: a });
    expect(late.leads.find((lead) => lead.id === a.id)).toEqual(changed);
    expect(late.leads.find((lead) => lead.id === b.id)?.status).toBe(
      "contacted",
    );
    expect(original.leads[0].notes).toBe("");
  });

  it("deduplicates imported records and applies saved preferences", () => {
    const a = newLead({ name: "Locale A", city: "Ragusa", category: "Bar" });
    const workspace = { leads: [a], preferences: defaultPreferences };
    const result = mergeWorkspaceResult(workspace, {
      results: [
        { lead: a, duplicate: true },
        { lead: a, duplicate: true },
      ],
      preferences: { ...defaultPreferences, qr: false },
    });
    expect(result.leads).toHaveLength(1);
    expect(result.preferences.qr).toBe(false);
  });
});
