import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newLead, type Lead } from "@/lib/model";
import { copyProblems, copyVariant, fallbackCopy } from "@/lib/site-preview";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse: mocks.parse };
  },
}));
import { generateSiteCopy } from "@/lib/ai/site-copy";
import { ensurePreview } from "@/lib/previews";
import { attachPreviews } from "@/lib/supabase/repository";

const lead = (extra: Partial<Lead> = {}) =>
  newLead({
    name: "Pizzeria Da Test",
    city: "Vittoria",
    category: "Pizzeria",
    user_id: "00000000-0000-4000-8000-000000000001",
    ...extra,
  });
const good = {
  title: "La pizza come piace a noi",
  intro: "Passa quando vuoi, ti aspettiamo con tanta voglia di chiacchierare!",
  offer: "Dai un'occhiata al menu con calma e scegli quello che ti va.",
  contact: "Per qualsiasi cosa chiamaci, ti rispondiamo volentieri.",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("friendly AI copy", () => {
  it("rejects an agency tone", () =>
    expect(
      copyProblems({
        ...good,
        intro:
          "Offriamo un'esperienza di qualità con passione e professionalità.",
      }).length,
    ).toBeGreaterThan(0));
  it("uses the cheap model and keeps a clean text", async () => {
    mocks.parse.mockResolvedValue({ output_parsed: good });
    expect(await generateSiteCopy(lead())).toEqual(good);
    expect(mocks.parse.mock.calls[0][0].model).toBe("gpt-5.6-luna");
  });
  it("retries with the reason when a fact is invented", async () => {
    mocks.parse
      .mockResolvedValueOnce({
        output_parsed: {
          ...good,
          intro: "Cuociamo tutto nel forno a legna, vieni!",
        },
      })
      .mockResolvedValueOnce({ output_parsed: good });
    expect(await generateSiteCopy(lead())).toEqual(good);
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(mocks.parse.mock.calls[1][0].instructions).toContain("a legna");
  });
  it("falls back to hand-written copy after two bad answers", async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: { ...good, title: "La pizza più buona di Vittoria" },
    });
    const l = lead();
    expect(await generateSiteCopy(l)).toEqual(
      fallbackCopy(l, copyVariant(l.id)),
    );
    expect(mocks.parse).toHaveBeenCalledTimes(2);
  });
  it("never calls the AI without a key or for demo leads", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await generateSiteCopy(lead());
    vi.stubEnv("OPENAI_API_KEY", "offline-test-key");
    await generateSiteCopy(lead({ is_demo: true }));
    expect(mocks.parse).not.toHaveBeenCalled();
  });
});

// A tiny stand-in for the Supabase query builder: enough for these calls.
function fakeDb(rows: Record<string, unknown>[], fail = false) {
  const calls: { op: string; value?: unknown }[] = [];
  const error = fail
    ? { message: 'relation "site_previews" does not exist' }
    : null;
  const builder = (op: string, value?: unknown) => {
    calls.push({ op, value });
    const result = () =>
      fail
        ? { data: null, error }
        : op === "insert"
          ? {
              data: {
                ...(value as object),
                views: 0,
                last_viewed_at: null,
                expires_at: "2099-01-01T00:00:00Z",
              },
              error: null,
            }
          : op === "update"
            ? { data: null, error: null }
            : { data: rows, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      range: () => Promise.resolve(result()),
      maybeSingle: () =>
        Promise.resolve(
          fail ? result() : { data: rows[0] ?? null, error: null },
        ),
      single: () => Promise.resolve(result()),
      then: (resolve: (v: unknown) => unknown) => resolve(result()),
    };
    return chain;
  };
  return {
    calls,
    db: {
      from: () => ({
        select: () => builder("select"),
        insert: (value: unknown) => builder("insert", value),
        update: (value: unknown) => builder("update", value),
      }),
    },
  };
}

describe("creating the preview", () => {
  it("creates one with a secret slug and public content", async () => {
    mocks.parse.mockResolvedValue({ output_parsed: good });
    const { db, calls } = fakeDb([]);
    const p = await ensurePreview(db as never, lead());
    expect(p?.slug).toMatch(/^[a-z0-9]{12}$/);
    const insert = calls.find((c) => c.op === "insert")?.value as {
      content: { copy: unknown; name: string };
    };
    expect(insert.content.name).toBe("Pizzeria Da Test");
    expect(insert.content.copy).toEqual(good);
  });
  it("keeps link and texts when the draft is written again", async () => {
    const existing = {
      slug: "keepkeepkeep",
      views: 2,
      last_viewed_at: null,
      expires_at: "2099-01-01T00:00:00Z",
      content: { copy: good },
    };
    const { db, calls } = fakeDb([existing]);
    const p = await ensurePreview(db as never, lead({ name: "Nuovo Nome" }));
    expect(p?.slug).toBe("keepkeepkeep");
    expect(mocks.parse).not.toHaveBeenCalled();
    const update = calls.find((c) => c.op === "update")?.value as {
      content: { copy: unknown; name: string };
    };
    expect(update.content).toMatchObject({ name: "Nuovo Nome", copy: good });
  });
  it("returns nothing, without throwing, when the table is missing", async () => {
    const { db } = fakeDb([], true);
    expect(await ensurePreview(db as never, lead())).toBeNull();
  });
});

describe("loading leads", () => {
  it("attaches previews to their leads", async () => {
    const l = lead();
    const { db } = fakeDb([
      {
        lead_id: l.id,
        slug: "abcdefghij12",
        views: 1,
        last_viewed_at: null,
        expires_at: "2099-01-01T00:00:00Z",
      },
    ]);
    await attachPreviews(db as never, [l]);
    expect(l.preview?.slug).toBe("abcdefghij12");
  });
  it("leaves leads untouched when migration 003 has not run", async () => {
    const l = lead();
    const { db } = fakeDb([], true);
    await expect(attachPreviews(db as never, [l])).resolves.toBeUndefined();
    expect(l.preview).toBeUndefined();
  });
});

describe("copy that sounds like a person", () => {
  it("rejects stock phrases", () => {
    for (const contact of [
      "Per qualsiasi informazione chiamateci quando volete.",
      "Non esitate a contattarci, saremo felici di sentirvi.",
      "Siamo lieti di accogliervi, scriveteci pure quando volete.",
    ])
      expect(copyProblems({ ...good, contact }).length).toBeGreaterThan(0);
  });
  it("rejects a title that repeats the venue's name, shown just above", () => {
    expect(
      copyProblems(
        { ...good, title: "Pizzeria Il Vesuvio a Comiso" },
        "Pizzeria Il Vesuvio",
      ).length,
    ).toBeGreaterThan(0);
    expect(copyProblems(good, "Pizzeria Il Vesuvio")).toEqual([]);
  });
});
