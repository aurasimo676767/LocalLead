import { describe, expect, it } from "vitest";
import { newLead, type Lead } from "@/lib/model";
import {
  pageLeads,
  detailQueue,
  activeNav,
  sectorHome,
} from "@/lib/lead-views";
import { sectorOf } from "@/lib/sector";

const mk = (
  name: string,
  category: Lead["category"],
  extra: Partial<Lead> = {},
) => newLead({ name, city: "Vittoria", category, ...extra });
const mixed = () => [
  mk("Bar Uno", "Bar"),
  mk("Casa Uno", "B&B"),
  mk("Pizzeria Due", "Pizzeria"),
  mk("Villa Due", "Casa vacanza"),
  mk("Casa Tre", "B&B", { status: "contacted" }),
  mk("Bar Tre", "Bar", { status: "contacted" }),
  mk("Casa Quattro", "B&B", { status: "archived" }),
  mk("Bar Quattro", "Bar", { status: "archived" }),
];

describe("pages never mix sectors", () => {
  it.each(["all", "contacted", "archive"] as const)("mode %s", (mode) => {
    const leads = mixed();
    const lodging = pageLeads(leads, mode, "alloggi");
    const food = pageLeads(leads, mode, "locali");
    expect(lodging.length).toBeGreaterThan(0);
    expect(food.length).toBeGreaterThan(0);
    expect(lodging.every((l) => sectorOf(l.category) === "alloggi")).toBe(true);
    expect(food.every((l) => sectorOf(l.category) === "locali")).toBe(true);
  });
});

describe("arrows stay in the sector of the open lead", () => {
  it("walks only lodging from a lodging lead, both ways", () => {
    const leads = mixed();
    const open = leads[1];
    const queue = detailQueue(open, leads);
    expect(queue.map((l) => l.name)).toEqual([
      "Casa Uno",
      "Villa Due",
      "Casa Tre",
    ]);
    const at = queue.indexOf(open);
    expect(queue[at - 1]).toBeUndefined();
    expect(sectorOf(queue[at + 1].category)).toBe("alloggi");
  });
  it("walks only food from a food lead", () => {
    const leads = mixed();
    expect(
      detailQueue(leads[0], leads).every(
        (l) => sectorOf(l.category) === "locali",
      ),
    ).toBe(true);
  });
  it("drops other-sector leads from a search queue", () => {
    const leads = mixed();
    const batch = leads.map((l) => l.id);
    const queue = detailQueue(leads[3], leads, batch);
    expect(queue.map((l) => l.name)).toEqual([
      "Casa Uno",
      "Villa Due",
      "Casa Tre",
    ]);
  });
});

describe("navigation", () => {
  it("highlights the sector of the open lead", () => {
    const leads = mixed();
    expect(activeNav(`/leads/${leads[1].id}`, leads)).toBe("/alloggi");
    expect(activeNav(`/leads/${leads[0].id}`, leads)).toBe("/leads");
    expect(activeNav("/alloggi/cerca", leads)).toBe("/alloggi");
    expect(activeNav("/leads/new", leads)).toBe("/leads");
    expect(activeNav("/numero", leads)).toBe("/numero");
  });
  it("sends back to the sector's list", () => {
    expect(sectorHome("alloggi")).toBe("/alloggi");
    expect(sectorHome("locali")).toBe("/leads");
  });
});
