import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { newLead, now, uid, type Lead } from "@/lib/model";
import { dedupKeys } from "@/lib/utils";
const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
let lead: Lead;
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function save(l: Lead, expected: string | null = null) {
  return db.query<{ result: { id: string; duplicate: boolean } }>(
    "select public.save_lead($1::jsonb,$2::text[],$3::timestamptz) as result",
    [JSON.stringify(l), dedupKeys(l), expected],
  );
}
describe("actual Postgres migration, RLS and atomic dedup", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      readFileSync(resolve("supabase/migrations/001_locallead.sql"), "utf8"),
    );
    await db.exec(
      readFileSync(resolve("supabase/migrations/002_delete_leads.sql"), "utf8"),
    );
    await db.query(
      "insert into auth.users(id,email) values ($1,'alice@example.com'),($2,'bob@example.com')",
      [alice, bob],
    );
    await asUser(alice);
    lead = newLead({
      name: "Database Pizza",
      city: "Vittoria",
      category: "Pizzeria",
      user_id: alice,
    });
    lead.sources = [
      {
        id: uid(),
        source_type: "manual",
        url: "https://example.com",
        confidence: 1,
        metadata_json: { test: true },
        created_at: now(),
      },
    ];
    lead.events = [
      { id: uid(), event_type: "new", notes: "Test", created_at: now() },
    ];
    lead.messages = [
      {
        id: uid(),
        message_type: "outreach",
        text: "Bozza test",
        model: "test",
        created_at: now(),
      },
    ];
    await save(lead);
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  it("creates a profile and stores child rows", async () => {
    expect((await db.query("select * from profiles")).rows).toHaveLength(1);
    expect((await db.query("select * from lead_sources")).rows).toHaveLength(1);
    expect((await db.query("select * from messages")).rows).toHaveLength(1);
    expect((await db.query("select * from lead_events")).rows).toHaveLength(1);
  });
  it("denies cross-user reads and writes", async () => {
    await asUser(bob);
    for (const table of [
      "leads",
      "lead_sources",
      "messages",
      "lead_events",
      "lead_keys",
    ])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
    await expect(
      db.query(
        "insert into lead_events(id,lead_id,event_type,notes) values($1,$2,'contacted','attack')",
        [uid(), lead.id],
      ),
    ).rejects.toThrow();
    await expect(save({ ...lead, name: "Attack" })).rejects.toThrow();
    await asUser(alice);
  });
  it("deduplicates transactionally and does not append children of duplicate", async () => {
    const other = {
      ...lead,
      id: uid(),
      messages: [{ ...lead.messages[0], id: uid() }],
    };
    const r = await save(other);
    expect(r.rows[0].result).toEqual({ id: lead.id, duplicate: true });
    expect((await db.query("select * from messages")).rows).toHaveLength(1);
  });
  it("blocks stale updates and saves status/history atomically", async () => {
    const update = {
      ...lead,
      updated_at: new Date(Date.now() + 1000).toISOString(),
      status: "contacted" as const,
    };
    await expect(save(update, null)).rejects.toThrow(/Conflict/);
    await save(update, lead.updated_at);
    const rows = await db.query<{ status: string }>("select status from leads");
    expect(rows.rows[0].status).toBe("contacted");
    lead = update;
  });
  it("rate limits persist and cannot be reset by the user", async () => {
    for (let i = 0; i < 60; i++)
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select consume_rate('expensive') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select consume_rate('expensive') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    await expect(db.exec("delete from rate_limits")).rejects.toThrow();
  });
  it("keeps suppressed identity after edits", async () => {
    const update = {
      ...lead,
      name: "Renamed Pizza",
      do_not_contact: true,
      updated_at: new Date(Date.now() + 2000).toISOString(),
    };
    await save(update, lead.updated_at);
    const rediscovered = { ...lead, id: uid() };
    expect((await save(rediscovered)).rows[0].result.duplicate).toBe(true);
  });
  it("bulk delete keeps contacted and opted-out leads and remembers the rest", async () => {
    const fresh = newLead({
      name: "Bar Da Cancellare",
      city: "Comiso",
      category: "Bar",
      place_id: "place-delete",
      user_id: alice,
    });
    const forgotten = newLead({
      name: "Pub Da Dimenticare",
      city: "Comiso",
      category: "Pub",
      place_id: "place-forget",
      user_id: alice,
    });
    await save(fresh);
    await save(forgotten);
    const deleted = await db.query<{ ids: string[] }>(
      "select public.delete_leads($1::uuid[], true) as ids",
      [[fresh.id, lead.id]],
    );
    // The seed lead has contact history and an opt-out: it must survive.
    expect(deleted.rows[0].ids).toEqual([fresh.id]);
    expect((await db.query("select id from leads where id=$1", [lead.id])).rows).toHaveLength(1);
    await db.query("select public.delete_leads($1::uuid[], false)", [[forgotten.id]]);
    const keys = (
      await db.query<{ key: string }>("select key from dismissed_keys")
    ).rows.map((row) => row.key);
    expect(keys).toContain("place:place-delete");
    expect(keys).not.toContain("place:place-forget");
    await asUser(bob);
    expect((await db.query("select * from dismissed_keys")).rows).toHaveLength(0);
    await asUser(alice);
  });
});
