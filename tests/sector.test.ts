import { describe, expect, it } from "vitest";
import {
  sectorOf,
  inSector,
  sectorCategories,
  isLodging,
} from "@/lib/sector";
import {
  dedupKeys,
  instagramUrl,
  portalName,
  portalFromText,
} from "@/lib/utils";
import { newLead } from "@/lib/model";

describe("sector", () => {
  it("derives the sector from the category", () => {
    expect(sectorOf("B&B")).toBe("alloggi");
    expect(sectorOf("Casa vacanza")).toBe("alloggi");
    expect(sectorOf("Pizzeria")).toBe("locali");
    expect(sectorOf("")).toBe("locali");
  });
  it("lists categories per sector without overlap", () => {
    expect(sectorCategories("alloggi")).toEqual(["B&B", "Casa vacanza"]);
    expect(sectorCategories("locali")).not.toContain("B&B");
    expect(sectorCategories("locali")).toContain("Pizzeria");
  });
  it("filters leads by sector", () => {
    const bnb = newLead({ name: "Casa Sole", city: "Vittoria", category: "B&B" });
    const bar = newLead({ name: "Bar Sole", city: "Vittoria", category: "Bar" });
    expect([bnb, bar].filter(inSector("alloggi"))).toEqual([bnb]);
    expect([bnb, bar].filter(inSector("locali"))).toEqual([bar]);
  });
  it("keeps B&Bs and guest houses, also when Google adds hotel", () => {
    expect(isLodging(["bed_and_breakfast", "lodging"])).toBe(true);
    expect(isLodging(["bed_and_breakfast", "hotel", "lodging"])).toBe(true);
    expect(isLodging(["guest_house", "lodging"])).toBe(true);
    expect(isLodging(["lodging", "point_of_interest"])).toBe(true);
  });
  it("drops hotels, hostels and anything that is not lodging", () => {
    expect(isLodging(["hotel", "lodging"])).toBe(false);
    expect(isLodging(["hostel", "lodging"])).toBe(false);
    expect(isLodging(["restaurant", "food"])).toBe(false);
    expect(isLodging([])).toBe(false);
    expect(isLodging(undefined)).toBe(false);
  });
});

describe("portals", () => {
  it("names booking portals", () => {
    expect(portalName("https://www.booking.com/hotel/it/casa-sole.html")).toBe(
      "Booking",
    );
    expect(portalName("https://www.airbnb.it/rooms/123")).toBe("Airbnb");
    expect(portalName("https://www.tripadvisor.it/Restaurant_Review")).toBe(
      "Tripadvisor",
    );
    expect(portalName("https://casasole.it")).toBe("");
  });
  it("reads the portal back from the evidence text", () => {
    expect(
      portalFromText("Su Google Maps il sito indicato è la pagina Booking"),
    ).toBe("Booking");
    expect(
      portalFromText("Su Google Maps il sito indicato è la pagina Facebook"),
    ).toBe("");
  });
  it("never treats two places on the same portal as duplicates", () => {
    const a = newLead({
      name: "Casa Sole",
      city: "Vittoria",
      category: "B&B",
      website_url: "https://www.booking.com/hotel/it/casa-sole.html",
    });
    const b = newLead({
      name: "Casa Luna",
      city: "Vittoria",
      category: "B&B",
      website_url: "https://www.booking.com/hotel/it/casa-luna.html",
    });
    expect(dedupKeys(a).some((k) => k.startsWith("domain:"))).toBe(false);
    expect(dedupKeys(a).filter((k) => dedupKeys(b).includes(k))).toEqual([]);
  });
});

describe("instagram link", () => {
  const lead = (extra = {}) =>
    newLead({
      name: "Casa Sole",
      city: "Vittoria",
      category: "B&B",
      instagram_url: "https://www.instagram.com/casasole",
      ...extra,
    });
  it("opens a real profile only", () => {
    expect(instagramUrl(lead())).toBe("https://www.instagram.com/casasole");
    expect(instagramUrl(lead({ instagram_url: "https://evil.com/x" }))).toBe(
      "",
    );
    expect(instagramUrl(lead({ is_demo: true }))).toBe("");
    expect(instagramUrl(lead({ do_not_contact: true }))).toBe("");
  });
});
