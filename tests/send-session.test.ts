import { describe, expect, it } from "vitest";
import { newLead, type Lead } from "@/lib/model";
import { chatQueue } from "@/lib/send-session";

const draft = (text: string) => ({
  id: crypto.randomUUID(),
  message_type: "outreach",
  text,
  model: "x",
  created_at: "",
});
const mk = (name: string, extra: Partial<Lead> = {}) =>
  newLead({
    name,
    city: "Vittoria",
    category: "Bar",
    phone: "333 123 4567",
    messages: [draft(`Buongiorno ${name}, vi ho fatto un sito`)],
    ...extra,
  });
const morning = new Date("2026-10-15T08:00:00Z");
const evening = new Date("2026-10-15T17:00:00Z");

describe("chats to prepare in WhatsApp in one go", () => {
  it("opens the WhatsApp app directly, with the latest draft", () => {
    const [chat] = chatQueue([mk("Bar Uno")], 20, morning);
    expect(chat.name).toBe("Bar Uno");
    expect(chat.url).toMatch(/^whatsapp:\/\/send\?phone=393331234567&text=/);
    expect(decodeURIComponent(chat.url)).toContain(
      "Buongiorno Bar Uno, vi ho fatto un sito",
    );
  });
  it("greets by the time the chat is opened", () => {
    const [chat] = chatQueue([mk("Bar Uno")], 20, evening);
    expect(decodeURIComponent(chat.url)).toContain("Buonasera Bar Uno");
  });
  it("skips leads without a draft, a mobile, or that must not be written", () => {
    const leads = [
      mk("Senza bozza", { messages: [] }),
      mk("Fisso", { phone: "0932 123456" }),
      mk("Opt-out", { do_not_contact: true }),
      mk("Già scritto", { status: "contacted" }),
      mk("Demo", { is_demo: true }),
      mk("Chiuso", { status: "not_interested" }),
      mk("Buono"),
    ];
    expect(chatQueue(leads, 20, morning).map((c) => c.name)).toEqual([
      "Buono",
    ]);
  });
  it("keeps the list order and stops at the batch size", () => {
    const leads = Array.from({ length: 30 }, (_, i) => mk(`Bar ${i}`));
    const queue = chatQueue(leads, 10, morning);
    expect(queue).toHaveLength(10);
    expect(queue.map((c) => c.name)).toEqual(
      leads.slice(0, 10).map((l) => l.name),
    );
  });
});
