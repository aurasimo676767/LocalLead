import { describe, expect, it } from "vitest";
import { findByPhone, phoneQueryDigits } from "@/lib/utils";
import { newLead } from "@/lib/model";

const pizza = newLead({
  name: "Pizzeria Test",
  city: "Livorno",
  category: "Pizzeria",
  phone: "+393331234567",
});
const bar = newLead({
  name: "Bar Test",
  city: "Vittoria",
  category: "Bar",
  phone: "+390932123456",
});
const leads = [pizza, bar];

describe("phone lookup", () => {
  it("adds +39 to a national number and keeps pasted prefixes", () => {
    expect(phoneQueryDigits("333 123 4567")).toBe("393331234567");
    expect(phoneQueryDigits("+39 333 1234567")).toBe("393331234567");
    expect(phoneQueryDigits("0039 333 1234567")).toBe("393331234567");
    expect(phoneQueryDigits("39 333 123 4567")).toBe("393331234567");
    expect(phoneQueryDigits("393 123 4567")).toBe("393931234567");
    expect(phoneQueryDigits("+44 20 7946 0958")).toBe("442079460958");
  });
  it("finds the venue from the number in any written form", () => {
    for (const typed of [
      "3331234567",
      "333 123 4567",
      "+39 333-123-4567",
      "0039 3331234567",
    ])
      expect(findByPhone(typed, leads)).toEqual([pizza]);
    expect(findByPhone("0932 123456", leads)).toEqual([bar]);
  });
  it("suggests matches while the number is still being typed", () => {
    expect(findByPhone("333 12", leads)).toEqual([pizza]);
    expect(findByPhone("33", leads)).toEqual([]);
    expect(findByPhone("555 000 0000", leads)).toEqual([]);
  });
});
