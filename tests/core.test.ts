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
import {
  newLead,
  defaultPreferences,
  categories,
  type Preferences,
} from "@/lib/model";
import { scoreLead, fitsFilter } from "@/lib/scoring";
import {
  buildOutreachContext,
  fallbackMessage,
  similarity,
  messageAllowed,
} from "@/lib/messaging";
import { demoLeads } from "@/lib/demo";
import {
  extractHtml,
  classifyWebsite,
  classifyMenu,
} from "@/lib/enrichment/html";
import { patchLead, csvRows, manualSources } from "@/lib/lead-actions";
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
  it("never treats review count as an outreach problem", () => {
    const lead = base();
    lead.reviews_count = 1321;
    lead.rating = 4.5;
    lead.analysis.evidence.push({
      id: "reviews",
      kind: "reviews",
      text: "1321 recensioni su Google Maps",
      url: "https://maps.google.com/example",
      confidence: 0.95,
    });
    const scored = scoreLead(lead);
    expect(scored.lead_score).toBeLessThan(40);
    expect(scored.main_problem).toBe("Nessuna opportunità verificata");
    expect(scored.analysis.reasons).toEqual([]);
  });
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
  it("keeps every offline variant valid across categories and preferences", () => {
    const preferences: Preferences[] = Array.from(
      { length: 64 },
      (_, bits) => ({
        ...defaultPreferences,
        qr: !!(bits & 1),
        events: !!(bits & 2),
        restyling: !!(bits & 4),
        local: !!(bits & 8),
        free_demo: !!(bits & 16),
        tone: bits & 32 ? "neutro" : "molto casual",
      }),
    );
    const leads = demoLeads().filter(
      (lead) =>
        !["bad_lead"].includes(lead.status) &&
        buildOutreachContext(lead, defaultPreferences).status === "ready",
    );
    for (const lead of leads)
      for (const category of categories)
        for (const prefs of preferences) {
          for (let i = 0; i < 6; i++) {
            const l = { ...lead, category };
            const text = fallbackMessage(l, prefs, i);
            expect(messageAllowed(text, l, prefs), `${category}: ${text}`).toBe(
              true,
            );
            expect(text).not.toMatch(
              /ho visto (?:il vostro menu|le foto)|guardando.*profilo/,
            );
            expect(text.split("\n")).toHaveLength(5);
            expect(text).toMatch(/mi chiamo Simone/);
            expect(text).toMatch(/su Google/);
            expect(text).not.toMatch(/aggiornabil|da soli|in autonomia/);
            expect(text.match(/,/g)?.length || 0).toBeLessThanOrEqual(5);
            expect(text).not.toMatch(/[;:]/);
            expect(text).toMatch(
              /(Vi interesserebbe|Potrebbe interessarvi|Che ne pensate|Può interessarvi|Vi potrebbe interessare una cosa del genere)\?$/,
            );
          }
        }
  });
  it("asks about a missing Google link without asserting that no site exists", () => {
    const lead = base();
    lead.analysis.evidence.push({
      id: "missing",
      kind: "website_missing",
      confidence: 0.9,
      url: "https://example.com",
      text: "No website field",
    });
    const text = fallbackMessage(lead, defaultPreferences);
    expect(text).toContain(
      "non sono riuscito a trovarlo e non so se ne avete già uno",
    );
    expect(
      messageAllowed(
        text.replace(/ho cercato[^\n]+/, "non avete un sito"),
        lead,
        defaultPreferences,
      ),
    ).toBe(false);
  });
  it("does not use weak or unsourced event evidence", () => {
    const lead = demoLeads()[2];
    lead.analysis.evidence = lead.analysis.evidence.map((e) =>
      e.kind === "events" ? { ...e, confidence: 0.4 } : e,
    );
    expect(fallbackMessage(lead, defaultPreferences)).not.toMatch(
      /serate|eventi/,
    );
    lead.analysis.evidence = lead.analysis.evidence.map((e) => ({
      ...e,
      confidence: 1,
      url: "",
    }));
    expect(fallbackMessage(lead, defaultPreferences)).not.toMatch(
      /serate|eventi|non risulta/,
    );
  });
  it("describes a manually verified failed site without diagnosing an outage", () => {
    const lead = demoLeads()[4];
    lead.website_status = "broken";
    lead.analysis.evidence.push({
      id: "timeout",
      kind: "website_unreachable",
      text: "Verifica manuale: il sito mostra una pagina di errore",
      url: lead.website_url,
      confidence: 0.9,
    });
    const text = fallbackMessage(lead, defaultPreferences);
    expect(text).toContain(
      "ho provato ad aprire il vostro sito ma al momento non si apre",
    );
    expect(text).not.toMatch(/restyling|rimetter|offline|QR/);
    expect(text).not.toMatch(/offline|QR/);
  });
  it("rejects the business name and internal UUIDs in outreach copy", () => {
    const lead = demoLeads()[0];
    const text = fallbackMessage(lead, defaultPreferences);
    expect(messageAllowed(text, lead, defaultPreferences)).toBe(true);
    expect(
      messageAllowed(`${text} ${lead.name}`, lead, defaultPreferences),
    ).toBe(false);
    expect(
      messageAllowed(
        `${text} (7b5f9fc2-e03e-4669-88f0-cd21b3026eb6)`,
        lead,
        defaultPreferences,
      ),
    ).toBe(false);
  });
  it("rejects leaked evidence labels and artificial review compliments", () => {
    const lead = demoLeads()[0];
    const text =
      "Ciao, mi occupo di siti per locali della zona. Ho visto che su Google non si trova un sito ufficiale, ma ci sono molte recensioni, segno che siete molto considerati in zona (E2). Se non ne avete ancora uno, potrebbe valere la pena pensarci per avere un posto dove aggiornare il menu. Ti va di parlarne?";
    expect(messageAllowed(text, lead, defaultPreferences)).toBe(false);
    for (const phrase of [
      "molte recensioni",
      "segno che siete apprezzati",
      "potrebbe valere la pena",
      "potrebbe essere utile",
      "magari con un QR",
    ]) {
      const candidate = `${fallbackMessage(lead, defaultPreferences)} ${phrase}`;
      expect(messageAllowed(candidate, lead, defaultPreferences), phrase).toBe(
        false,
      );
    }
  });
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
  it("offers to update an existing weak site in simple language", () => {
    const text = fallbackMessage(demoLeads()[4], defaultPreferences);
    expect(text).toMatch(/rifar|sistem|aggiorna|rendere/);
    expect(text).not.toMatch(/restyling/);
  });
  it("accepts only the requested direct closing questions", () => {
    const lead = demoLeads()[0];
    const text = fallbackMessage(lead, defaultPreferences);
    for (const closing of [
      "Ti va di parlarne?",
      "Se vi va ne parliamo",
      "Possiamo sentirci?",
      "Resto a disposizione",
      "Senza impegno",
    ]) {
      expect(
        messageAllowed(
          text.replace(/[^\n]+$/, closing),
          lead,
          defaultPreferences,
        ),
        closing,
      ).toBe(false);
    }
  });
  it("turns website states into human observations and concrete value", () => {
    const none = demoLeads()[0];
    expect(fallbackMessage(none, defaultPreferences)).toContain(
      "ho cercato il vostro sito ma non sono riuscito a trovarlo",
    );
    const unknown = base();
    expect(fallbackMessage(unknown, defaultPreferences)).toBe("");
    expect(buildOutreachContext(unknown, defaultPreferences).status).toBe(
      "insufficient_outreach_context",
    );
    const broken = { ...demoLeads()[4], website_status: "broken" as const };
    broken.analysis.evidence = [
      {
        id: "broken",
        kind: "website_unreachable",
        text: "Verifica manuale: il sito mostra una pagina di errore",
        url: "https://example.com",
        confidence: 0.9,
      },
    ];
    expect(fallbackMessage(broken, defaultPreferences)).toContain(
      "ho provato ad aprire il vostro sito ma al momento non si apre",
    );
    const poor = {
      ...demoLeads()[4],
      analysis: {
        ...demoLeads()[4].analysis,
        evidence: demoLeads()[4].analysis.evidence.filter(
          (e) => !["sparse", "curated_social"].includes(e.kind),
        ),
      },
    };
    expect(fallbackMessage(poor, defaultPreferences)).toMatch(
      /poco dentro|pochi contenut|scarno/,
    );
    expect(fallbackMessage(demoLeads()[4], defaultPreferences)).toMatch(
      /foto sono curate|social curate|pagina è curata/,
    );
  });
  it("rejects database language and generic site formulas", () => {
    const lead = demoLeads()[0];
    const valid = fallbackMessage(lead, defaultPreferences);
    for (const phrase of [
      "nella scheda Google non è indicato un sito",
      "non risulta un sito web",
      "il sito non è presente nella scheda",
      "sito semplice",
      "sito base",
      "pagina semplice",
    ]) {
      expect(
        messageAllowed(
          valid.replace(
            "ho cercato il vostro sito ma non sono riuscito a trovarlo",
            phrase,
          ),
          lead,
          defaultPreferences,
        ),
        phrase,
      ).toBe(false);
    }
    expect(valid).toMatch(/il menu|i prodotti|il menu drink/);
    expect(valid).toMatch(/come lo volete voi|su misura|personalizzat/);
  });
  it("rejects a generic pitch even when the lead has evidence", () => {
    const lead = demoLeads()[0];
    expect(
      messageAllowed(
        "Ciao, vi scrivo per il vostro sito\nMi occupo di siti per locali della zona e posso aiutarvi ad aggiornarlo\nVi potrebbe interessare una cosa del genere?",
        lead,
        defaultPreferences,
      ),
    ).toBe(false);
  });
  it("builds a verified contact reason or marks the context insufficient", () => {
    const context = buildOutreachContext(demoLeads()[1], defaultPreferences);
    expect(context.status).toBe("ready");
    expect(context.reasonKind).toBe("menu_ads");
    expect(context.contactReason).toMatch(/menu.*pubblicità/i);
    expect(context.attributions.every((item) => item.url)).toBe(true);

    const insufficient = buildOutreachContext(base(), defaultPreferences);
    expect(insufficient.status).toBe("insufficient_outreach_context");
    expect(insufficient.attributions).toEqual([]);
  });
  it("keeps every fallback valid for each contact reason", () => {
    const evidenceLead = (kind: string) => {
      const lead = base();
      lead.website_status =
        kind === "website_unreachable" ? "broken" : "own_website";
      lead.website_quality = "poor";
      lead.analysis.evidence = [
        {
          id: kind,
          kind,
          text:
            kind === "weak_website"
              ? "Revisione manuale: sito poco moderno"
              : kind === "website_unreachable"
                ? "Verifica manuale: il sito mostra una pagina di errore"
                : `Osservazione verificata: ${kind}`,
          url: "https://example.com/source",
          confidence: 0.9,
        },
      ];
      return lead;
    };
    const instagram = base();
    instagram.menu_status = "instagram_only";
    instagram.menu_url = "https://instagram.com/example/menu";
    instagram.sources = [
      {
        id: "instagram-source",
        source_type: "manual",
        url: instagram.menu_url,
        confidence: 0.9,
        metadata_json: {},
        created_at: new Date().toISOString(),
      },
    ];
    const leads = [
      evidenceLead("website_unreachable"),
      evidenceLead("weak_website"),
      evidenceLead("sparse"),
      instagram,
    ];
    for (const lead of leads) {
      expect(buildOutreachContext(lead, defaultPreferences).status).toBe(
        "ready",
      );
      for (let index = 0; index < 15; index++) {
        const text = fallbackMessage(lead, defaultPreferences, index);
        expect(messageAllowed(text, lead, defaultPreferences), text).toBe(true);
      }
    }
  });
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
    expect(whatsappCheckUrl({ ...l, phone: "0932 123456" }, "ciao")).toBe("");
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
  it("keeps manual source history across URL edits and status updates", () => {
    const lead = manualSources({
      ...base(),
      website_url: "https://example.com/old",
    });
    const original = lead.sources[0];
    const edited = patchLead(lead, { website_url: "https://example.com/new" });
    const contacted = patchLead(edited, { status: "contacted" });
    expect(contacted.sources).toHaveLength(2);
    expect(contacted.sources[0]).toEqual(original);
    expect(contacted.sources[1]).toEqual(edited.sources[1]);
  });
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
  it("requires a manual source before marking a website as broken", () => {
    expect(() => patchLead(base(), { website_status: "broken" })).toThrow();
    const updated = patchLead(base(), {
      website_status: "broken",
      verification_url: "https://example.com/check",
      verification_note:
        "Aperto nel browser e restituisce una pagina di errore",
    });
    expect(updated.analysis.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "website_unreachable",
          text: expect.stringMatching(/^Verifica manuale:/),
          confidence: 1,
        }),
      ]),
    );
    expect(fallbackMessage(updated, defaultPreferences)).toContain(
      "al momento non si apre",
    );
  });
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
