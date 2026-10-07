import { describe, expect, it } from "vitest";
import { deleteAllLeads } from "@/lib/supabase/repository";

type Row = Record<string, unknown>;
// A small in-memory stand-in for the Supabase query builder used here.
function fakeDb(tables: Record<string, Row[]>) {
  const log: string[] = [];
  const from = (table: string) => {
    let rows = () => tables[table];
    const filters: ((r: Row) => boolean)[] = [];
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value);
        return chain;
      },
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]));
        if (mode === "delete") {
          const doomed = rows().filter((r) => filters.every((f) => f(r)));
          tables[table] = rows().filter((r) => !doomed.includes(r));
          log.push(`delete ${table} ${doomed.length}`);
          return Promise.resolve({ data: null, error: null });
        }
        return chain;
      },
      range: (a: number, b: number) =>
        Promise.resolve({
          data: rows()
            .filter((r) => filters.every((f) => f(r)))
            .slice(a, b + 1),
          error: null,
        }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({
          data: rows().filter((r) => filters.every((f) => f(r))),
          error: null,
        }),
      upsert: (values: Row[]) => {
        for (const v of values)
          if (!tables[table].some((r) => r.key === v.key))
            tables[table].push(v);
        log.push(`remember ${values.length}`);
        return Promise.resolve({ error: null });
      },
      delete: () => {
        mode = "delete";
        return chain;
      },
    };
    let mode = "read";
    rows = () => tables[table];
    return chain;
  };
  return { db: { from }, log, tables };
}

describe("wiping every lead", () => {
  it("deletes contacted leads too, remembers them, and keeps opt-outs", async () => {
    const { db, log, tables } = fakeDb({
      leads: [
        { id: "new", do_not_contact: false },
        { id: "contacted", do_not_contact: false },
        { id: "optout", do_not_contact: true },
      ],
      lead_keys: [
        { lead_id: "new", key: "place:new" },
        { lead_id: "contacted", key: "phone:+39333" },
        { lead_id: "optout", key: "place:optout" },
      ],
      dismissed_keys: [],
    });
    const deleted = await deleteAllLeads(db as never, "user-1");
    expect(deleted.sort()).toEqual(["contacted", "new"]);
    expect(tables.leads.map((r) => r.id)).toEqual(["optout"]);
    expect(tables.dismissed_keys.map((r) => r.key).sort()).toEqual([
      "phone:+39333",
      "place:new",
    ]);
    // Keys are saved before anything is deleted.
    expect(log[0]).toMatch(/^remember/);
  });
});
