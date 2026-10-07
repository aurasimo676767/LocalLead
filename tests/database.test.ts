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
async function asAnon() {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role anon");
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
    await db.exec(
      readFileSync(
        resolve("supabase/migrations/003_site_previews.sql"),
        "utf8",
      ),
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
    expect(
      (await db.query("select id from leads where id=$1", [lead.id])).rows,
    ).toHaveLength(1);
    await db.query("select public.delete_leads($1::uuid[], false)", [
      [forgotten.id],
    ]);
    const keys = (
      await db.query<{ key: string }>("select key from dismissed_keys")
    ).rows.map((row) => row.key);
    expect(keys).toContain("place:place-delete");
    expect(keys).not.toContain("place:place-forget");
    await asUser(bob);
    expect((await db.query("select * from dismissed_keys")).rows).toHaveLength(
      0,
    );
    await asUser(alice);
  });
  describe("site previews: owner-only table, public read through the secret link", () => {
    type Preview = {
      content: { name: string };
      place_id: string;
      sender: { name: string; phone: string; price: number };
      user_id?: string;
    } | null;
    const read = async (slug: string, count = true) =>
      (
        await db.query<{ p: Preview }>(
          "select public.site_preview($1,$2) as p",
          [slug, count],
        )
      ).rows[0].p;
    let shop: Lead;
    beforeAll(async () => {
      await asUser(alice);
      shop = newLead({
        name: "Pizzeria Anteprima",
        city: "Vittoria",
        category: "Pizzeria",
        place_id: "place-preview",
        user_id: alice,
      });
      await save(shop);
      await db.query(
        "update profiles set preferences = preferences || $1::jsonb where id = $2",
        [
          JSON.stringify({
            sender_name: "Simone",
            sender_phone: "+393331234567",
            site_price: 200,
          }),
          alice,
        ],
      );
      await db.query(
        "insert into site_previews(slug,lead_id,user_id,content) values ('abcdefghij12',$1,$2,$3::jsonb)",
        [shop.id, alice, JSON.stringify({ name: "Pizzeria Anteprima" })],
      );
    });
    it("does not count the owner's own visits", async () => {
      await asUser(alice);
      expect((await read("abcdefghij12"))?.content.name).toBe(
        "Pizzeria Anteprima",
      );
      const row = await db.query<{ views: number }>(
        "select views from site_previews where slug='abcdefghij12'",
      );
      expect(row.rows[0].views).toBe(0);
    });
    it("keeps other users out of the table", async () => {
      await asUser(bob);
      expect((await db.query("select * from site_previews")).rows).toHaveLength(
        0,
      );
      await expect(
        db.query(
          "insert into site_previews(slug,lead_id,user_id,content) values ('bobbobbobbob',$1,$2,'{}')",
          [shop.id, bob],
        ),
      ).rejects.toThrow();
      await asUser(alice);
    });
    it("lets anyone with the link read public content and counts the visit", async () => {
      await asAnon();
      await expect(db.query("select * from site_previews")).rejects.toThrow();
      const p = await read("abcdefghij12");
      expect(p).toMatchObject({
        content: { name: "Pizzeria Anteprima" },
        place_id: "place-preview",
        sender: { name: "Simone", phone: "+393331234567", price: 200 },
      });
      expect(p?.user_id).toBeUndefined();
      await read("abcdefghij12", false);
      expect(await read("nonesistente1")).toBeNull();
      await asUser(alice);
      const row = await db.query<{
        views: number;
        last_viewed_at: string | null;
      }>(
        "select views,last_viewed_at from site_previews where slug='abcdefghij12'",
      );
      expect(row.rows[0].views).toBe(1);
      expect(row.rows[0].last_viewed_at).not.toBeNull();
    });
    it("hides expired links and opted-out leads", async () => {
      await asUser(alice);
      // The seed lead was opted out by an earlier test.
      await db.query(
        "insert into site_previews(slug,lead_id,user_id,content) values ('optedout0001',$1,$2,'{}')",
        [lead.id, alice],
      );
      await db.query(
        "update site_previews set expires_at = now() - interval '1 day' where slug='abcdefghij12'",
      );
      await asAnon();
      expect(await read("optedout0001")).toBeNull();
      expect(await read("abcdefghij12")).toBeNull();
      await asUser(alice);
    });
    it("loads billed photos for real visitors only, at most 12 times an hour", async () => {
      await asUser(alice);
      const shop2 = newLead({
        name: "Bar Foto",
        city: "Vittoria",
        category: "Bar",
        place_id: "place-photos",
        user_id: alice,
      });
      await save(shop2);
      await db.query(
        "insert into site_previews(slug,lead_id,user_id,content) values ('photosphotos',$1,$2,'{}')",
        [shop2.id, alice],
      );
      await asAnon();
      // Link unfurlers and metadata: no photos, but the page still credits Google.
      const bot = (await read("photosphotos", false)) as unknown as {
        place_id: string;
        from_google: boolean;
      };
      expect(bot.place_id).toBe("");
      expect(bot.from_google).toBe(true);
      const places: string[] = [];
      for (let i = 0; i < 13; i++)
        places.push((await read("photosphotos"))!.place_id);
      expect(places.slice(0, 12).every((p) => p === "place-photos")).toBe(true);
      expect(places[12]).toBe("");
      await asUser(alice);
    });
    it("rejects guessable slugs", async () => {
      await asUser(alice);
      const other = newLead({
        name: "Bar Slug",
        city: "Vittoria",
        category: "Bar",
        place_id: "place-slug",
        user_id: alice,
      });
      await save(other);
      await expect(
        db.query(
          "insert into site_previews(slug,lead_id,user_id,content) values ('abc',$1,$2,'{}')",
          [other.id, alice],
        ),
      ).rejects.toThrow();
    });
  });
});
