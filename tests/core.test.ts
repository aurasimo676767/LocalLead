import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  duplicate,
  safeUrl,
  publicIp,
  whatsappUrl,
  whatsappCheckUrl,
  isLandlinePhone,
  dedupKeys,
} from "@/lib/utils";
import { newLead, defaultPreferences } from "@/lib/model";
import { scoreLead, fitsFilter } from "@/lib/scoring";
import { fallbackMessage, similarity, messageAllowed } from "@/lib/messaging";
import { demoLeads } from "@/lib/demo";
import {
  extractHtml,
  classifyWebsite,
  classifyMenu,
} from "@/lib/enrichment/html";
import { patchLead, csvRows } from "@/lib/lead-actions";
const base = () =>
  newLead({ name: "Pizzeria Test", city: "Vittoria", category: "Pizzeria" });
describe("phone normalization", () => {
  it.each([
    ["333 123 4567", "+393331234567"],
    ["0039 333 1234567", "+393331234567"],
    ["+39 02 12345678", "+390212345678"],
    ["02 12345678", "+390212345678"],
    ["no number", ""],
    ["123", ""],
  ])("%s => %s", (input, output) => expect(normalizePhone(input)).toBe(output));
  it("keeps a non-Italian international number", () =>
    expect(normalizePhone("+1 202 555 0123")).toBe("+12025550123"));
  it("recognizes Italian landlines separately from mobiles", () => {
    expect(isLandlinePhone("0932 123456")).toBe(true);
    expect(isLandlinePhone("333 123 4567")).toBe(false);
  });
});
describe("deduplication", () => {
  it("prioritizes place ID over phone and includes archived leads", () => {
    const a = { ...base(), place_id: "one", status: "archived" as const };
    const b = { ...base(), phone: "3331234567", name: "Another" };
    const candidate = { ...base(), place_id: "one", phone: "3331234567" };
    expect(duplicate(candidate, [b, a])?.id).toBe(a.id);
  });
  it("normalizes accents/name/city", () => {
    const a = { ...base(), name: "Pizzerìa Tèst" };
    expect(duplicate(base(), [a])?.id).toBe(a.id);
  });
  it("deduplicates international phones", () => {
    const a = { ...base(), phone: "00393331234567", name: "Different" };
    expect(duplicate({ ...base(), phone: "3331234567" }, [a])?.id).toBe(a.id);
  });
  it("deduplicates own domains", () =>
    expect(
      duplicate({ ...base(), website_url: "https://www.restaurant.it/menu" }, [
        { ...base(), name: "Altro", website_url: "http://restaurant.it" },
      ]),
    ).toBeDefined());
  it("does not merge different businesses on Facebook/external menus", () =>
    expect(
      dedupKeys({ ...base(), website_url: "https://facebook.com/a" }),
    ).not.toContain("domain:facebook.com"));
  it("does not merge unrelated name and city", () =>
    expect(
      duplicate(base(), [{ ...base(), name: "Other", city: "Ragusa" }]),
    ).toBeUndefined());
});
describe("public URL validation", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://localhost/",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.0.1",
    "http://169.254.169.254",
    "http://100.64.0.1",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[fc00::1]",
    "https://user:pass@public.com",
    "https://public.com:8443",
    "https://x.internal",
  ])("rejects %s", (url) => expect(safeUrl(url)).toBe(""));
  it("allows public http/https", () =>
    expect(safeUrl("https://example.com/menu?q=1")).toBe(
      "https://example.com/menu?q=1",
    ));
  it("rejects reserved IP blocks", () => {
    expect(publicIp("192.0.2.1")).toBe(false);
    expect(publicIp("8.8.8.8")).toBe(true);
    expect(publicIp("::ffff:192.168.0.1")).toBe(false);
  });
});
describe("scoring and evidence", () => {
  it("unknown data never becomes a hot lead", () =>
    expect(scoreLead(base()).lead_score).toBeLessThan(40));
  it("does not add no-site points without evidence", () =>
    expect(
      scoreLead({ ...base(), website_status: "none" }).analysis.reasons.some(
        (r) => r.points === 30,
      ),
    ).toBe(false));
  it("closed and opted-out leads score zero", () => {
    const l = demoLeads()[0];
    expect(scoreLead({ ...l, do_not_contact: true }).lead_score).toBe(0);
    expect(demoLeads()[6].lead_score).toBe(0);
  });
  it("excellent sites are low priority", () =>
    expect(demoLeads()[5].lead_score).toBeLessThan(40));
  it("saves source IDs for all positive reasons", () =>
    expect(
      demoLeads()[0]
        .analysis.reasons.filter((r) => r.points > 0)
        .every((r) => r.evidence_ids.length),
    ).toBe(true));
  it("filters without pretending unknown means none", () =>
    expect(fitsFilter(base(), "none")).toBe(false));
});
describe("messages and contacts", () => {
  it("detects identical messages and different content", () => {
    expect(similarity("ciao come va", "ciao come va")).toBe(1);
    expect(similarity("ciao come va", "prodotti forno fresco")).toBe(0);
  });
  it("never adds events without verified signals", () =>
    expect(fallbackMessage(demoLeads()[0], defaultPreferences)).not.toMatch(
      /serate|eventi/,
    ));
  it("only mentions events when enabled", () => {
    expect(fallbackMessage(demoLeads()[2], defaultPreferences)).toMatch(
      /serate/,
    );
    expect(
      fallbackMessage(demoLeads()[2], { ...defaultPreferences, events: false }),
    ).not.toMatch(/serate|eventi/);
  });
  it("pitches restyling for an existing weak site", () =>
    expect(fallbackMessage(demoLeads()[4], defaultPreferences)).toContain(
      "restyling",
    ));
  it("makes no pitch for excellent or closed leads", () => {
    expect(fallbackMessage(demoLeads()[5], defaultPreferences)).toBe("");
    expect(fallbackMessage(demoLeads()[6], defaultPreferences)).toBe("");
  });
  it("does not propose QR codes to bakeries", () =>
    expect(fallbackMessage(demoLeads()[3], defaultPreferences)).not.toMatch(
      /QR/,
    ));
  it("includes menu and QR in a food venue site pitch when enabled", () => {
    const text = fallbackMessage(demoLeads()[1], defaultPreferences);
    expect(text).toMatch(/menu/i);
    expect(text).toMatch(/QR/i);
  });
  it("validates disabled event and demo preferences", () =>
    expect(
      messageAllowed(
        "ciao " + "test ".repeat(40) + "demo gratuita",
        demoLeads()[0],
        defaultPreferences,
      ),
    ).toBe(false));
  it("rejects copywriter compliments and marketing wording", () =>
    expect(
      messageAllowed(
        "ciao " +
          "siete un punto di riferimento della zona, ho visto le vostre recensioni e posso ottimizzare la presenza online. ".repeat(
            3,
          ) +
          "io mi occupo di siti, se vi interessa ne parliamo",
        demoLeads()[0],
        defaultPreferences,
      ),
    ).toBe(false));
  it("guards WhatsApp and encodes the draft", () => {
    const l = {
      ...base(),
      phone: "3331234567",
      whatsapp_confidence: "uncertain" as const,
    };
    expect(whatsappUrl(l, "ciao")).toBe("");
    expect(
      whatsappUrl(
        { ...l, whatsapp_confidence: "confirmed_business" },
        "ciao & caffè",
      ),
    ).toContain("text=ciao%20%26%20caff%C3%A8");
    expect(
      whatsappCheckUrl(
        { ...l, phone: "0932 123456" },
        "ciao",
      ),
    ).toBe("");
    expect(
      whatsappUrl(
        {
          ...l,
          whatsapp_confidence: "confirmed_business",
          do_not_contact: true,
        },
        "ciao",
      ),
    ).toBe("");
  });
  it("offers a safe check link without asserting WhatsApp business", () => {
    const l = {
      ...base(),
      phone: "3331234567",
      whatsapp_confidence: "uncertain" as const,
    };
    expect(whatsappCheckUrl(l, "ciao")).toContain("wa.me/393331234567");
  });
});
describe("website classification", () => {
  it("recognizes HTML features and ignores scripts", () => {
    const f = extractHtml(
      '<html><head><title>Pizza</title><meta name="viewport" content="width=device-width"></head><body><p>DJ set venerdì</p><a href="/menu.pdf">Menu</a><a href="https://instagram.com/pizza">Social</a><script>fake content</script><img src="a.png"><footer>© 2026</footer></body></html>',
      "https://example.com",
    );
    expect(f.title).toBe("Pizza");
    expect(f.menu_links).toContain("https://example.com/menu.pdf");
    expect(f.viewport).toBe(true);
    expect(f.event_signals.length).toBe(1);
    expect(f.excerpt).not.toContain("fake content");
  });
  it("does not call a JS shell poor", () =>
    expect(
      classifyWebsite(
        extractHtml(
          '<html><body><div id="root"></div></body></html>',
          "https://example.com",
        ),
      ),
    ).toBe("unknown"));
  it("recognizes HTTP errors", () =>
    expect(classifyWebsite(extractHtml("", "https://example.com", 404))).toBe(
      "broken",
    ));
  it("external does not automatically mean ads", () => {
    expect(
      classifyMenu("https://leggimenu.it/menu/a", "https://pizza.it"),
    ).toBe("external_platform");
    expect(extractHtml("<p>Menu</p>", "https://leggimenu.it").ad_markers).toBe(
      0,
    );
  });
  it("recognizes PDF and social menus", () => {
    expect(classifyMenu("https://pizza.it/menu.pdf?x=1", "")).toBe("pdf");
    expect(classifyMenu("https://facebook.com/x", "")).toBe("facebook_only");
    expect(classifyMenu("https://facebook.com.evil.com/x", "")).toBe(
      "external_platform",
    );
  });
});
describe("CRM and import", () => {
  it("preserves omitted contact fields when changing status", () => {
    const l = {
      ...base(),
      phone: "+393331234567",
      website_url: "https://example.com",
      facebook_url: "https://facebook.com/test",
      notes: "Keep this note",
    };
    const updated = patchLead(l, { status: "contacted", channel: "Email" });
    expect(updated.phone).toBe(l.phone);
    expect(updated.website_url).toBe(l.website_url);
    expect(updated.facebook_url).toBe(l.facebook_url);
    expect(updated.notes).toBe(l.notes);
  });
  it("verifies existing phone without having to resubmit it", () => {
    const l = { ...base(), phone: "+12025550123" };
    const updated = patchLead(l, {
      whatsapp_confidence: "confirmed_business",
      website_status: "none",
      verification_url: "https://example.com/source",
      verification_note: "Confirmed business contact; no official website",
    });
    expect(updated.phone).toBe(l.phone);
    expect(updated.whatsapp_confidence).toBe("confirmed_business");
    expect(updated.website_status).toBe("none");
    expect(updated.analysis.evidence.some((e) => e.kind === "whatsapp")).toBe(
      true,
    );
  });
  it("requires evidence to assert WhatsApp", () =>
    expect(() =>
      patchLead(
        { ...base(), phone: "3331234567" },
        { whatsapp_confidence: "confirmed_business" },
      ),
    ).toThrow());
  it("records manual contact with channel", () => {
    const l = patchLead(base(), {
      status: "contacted",
      channel: "Email",
      event_notes: "Primo saluto",
    });
    expect(l.events[0].channel).toBe("Email");
    expect(l.status).toBe("contacted");
  });
  it("archives do-not-contact and blocks contacting", () => {
    const l = patchLead(base(), { do_not_contact: true });
    expect(l.status).toBe("archived");
    expect(() => patchLead(l, { status: "contacted" })).toThrow();
  });
  it("validates every CSV row", () => {
    const rows = csvRows([
      { name: "Locale", city: "Vittoria", category: "Pizzeria" },
      { name: "", city: "X", category: "Invalid" },
    ]);
    expect(rows[0].data?.name).toBe("Locale");
    expect(rows[1].data).toBeNull();
  });
  it("invalidates cached analysis after URL change", () => {
    const l = patchLead(demoLeads()[4], {
      website_url: "https://different.it",
    });
    expect(l.analysis.analyzed_at).toBeNull();
    expect(l.website_quality).toBe("unknown");
  });
});
