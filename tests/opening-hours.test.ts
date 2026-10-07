import { describe, expect, it } from "vitest";
import { openStatus } from "@/lib/opening-hours";
import { previewLook } from "@/lib/site-preview";

const week = [
  "lunedì: Chiuso",
  "martedì: 12:00–15:00, 19:00–23:30",
  "mercoledì: 12:00–15:00, 19:00–23:30",
  "giovedì: 12:00–15:00, 19:00–23:30",
  "venerdì: 19:00–01:00",
  "sabato: Aperto 24 ore",
  "domenica: 19:00–23:30",
];
// October in Italy is UTC+2.
const rome = (iso: string) => new Date(`${iso}+02:00`);

describe("open now, from Google's hours", () => {
  it("says it is open and until when", () =>
    expect(openStatus(week, rome("2026-10-06T13:10:00"))).toEqual({
      open: true,
      text: "Aperto ora, fino alle 15:00",
    }));
  it("says when it opens later today", () =>
    expect(openStatus(week, rome("2026-10-06T16:00:00"))).toEqual({
      open: false,
      text: "Apriamo oggi alle 19:00",
    }));
  it("follows a range past midnight into the next day", () =>
    expect(openStatus(week, rome("2026-10-10T00:30:00"))).toEqual({
      open: true,
      text: "Aperto ora, fino alle 01:00",
    }));
  it("handles open all day", () =>
    expect(openStatus(week, rome("2026-10-10T15:00:00"))).toEqual({
      open: true,
      text: "Aperto ora",
    }));
  it("shows nothing on a closed day or after closing", () => {
    expect(openStatus(week, rome("2026-10-05T20:00:00"))).toBeNull();
    expect(openStatus(week, rome("2026-10-06T23:45:00"))).toBeNull();
  });
  it("accepts Google's spaced dashes and shows nothing it cannot read", () => {
    expect(
      openStatus(["martedì: 12:00 – 15:00"], rome("2026-10-06T13:00:00"))?.open,
    ).toBe(true);
    expect(openStatus([], rome("2026-10-06T13:00:00"))).toBeNull();
    expect(openStatus(["boh"], rome("2026-10-06T13:00:00"))).toBeNull();
  });
});

describe("each preview looks a bit different", () => {
  it("is stable for a link and varies across links", () => {
    expect(previewLook("abcdefghij12")).toEqual(previewLook("abcdefghij12"));
    const looks = new Set(
      Array.from({ length: 30 }, (_, i) =>
        JSON.stringify(previewLook(`slug${i}x`)),
      ),
    );
    expect(looks.size).toBeGreaterThan(4);
  });
  it("always picks a real title line and a small hue shift", () => {
    for (let i = 0; i < 200; i++) {
      const look = previewLook(`demo-${i}-xyzxyzxyz`);
      expect([0, 1, 2]).toContain(look.outlined);
      expect(look.hue).toBeGreaterThanOrEqual(-12);
      expect(look.hue).toBeLessThanOrEqual(12);
    }
  });
});
