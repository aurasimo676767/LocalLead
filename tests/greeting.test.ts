import { describe, expect, it } from "vitest";
import { fixGreeting, timeGreeting } from "@/lib/greeting";

// October in Italy is UTC+2.
const rome = (time: string) => new Date(`2026-10-07T${time}+02:00`);

describe("good morning or good evening, by the hour in Italy", () => {
  it.each([
    ["08:30:00", "buongiorno"],
    ["13:59:00", "buongiorno"],
    ["14:00:00", "buonasera"],
    ["21:15:00", "buonasera"],
  ])("%s is %s", (time, word) => expect(timeGreeting(rome(time))).toBe(word));
  it("updates the greeting of a draft when it is sent", () => {
    const morning = "ciao buongiorno! cercandovi su google...\nsono Simone";
    expect(fixGreeting(morning, rome("19:00:00"))).toBe(
      "ciao buonasera! cercandovi su google...\nsono Simone",
    );
    expect(fixGreeting("Ciao Buonasera, ...", rome("09:00:00"))).toBe(
      "Ciao Buongiorno, ...",
    );
    expect(fixGreeting("ciao! nessun saluto", rome("19:00:00"))).toBe(
      "ciao! nessun saluto",
    );
  });
  it("only touches the opening line", () =>
    expect(fixGreeting("ciao!\nvi auguro buongiorno", rome("19:00:00"))).toBe(
      "ciao!\nvi auguro buongiorno",
    ));
});
