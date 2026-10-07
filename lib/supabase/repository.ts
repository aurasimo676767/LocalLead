import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Lead,
  type SitePreview,
  type Workspace,
  preferencesSchema,
} from "../model";
import { dedupKeys } from "../utils";
export async function allLeads(db: SupabaseClient): Promise<Lead[]> {
  const rows: Lead[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("leads")
      .select("*, sources:lead_sources(*), messages(*), events:lead_events(*)")
      .order("created_at", { ascending: false })
      .range(offset, offset + 499);
    if (error)
      throw new Error(
        "Impossibile leggere i lead. Verifica la migrazione Supabase.",
      );
    rows.push(...(data as Lead[]));
    if (data.length < 500) break;
  }
  for (const l of rows) {
    l.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    l.events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  await attachPreviews(db, rows);
  return rows;
}
/**
 * Read separately and never fatal: before migration 003 runs the table is
 * missing, and leads simply have no preview.
 */
export async function attachPreviews(db: SupabaseClient, leads: Lead[]) {
  if (!leads.length) return;
  try {
    const byLead = new Map<string, SitePreview>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from("site_previews")
        .select("lead_id,slug,views,last_viewed_at,expires_at")
        .range(offset, offset + 999);
      if (error || !data) return;
      for (const { lead_id, ...preview } of data as (SitePreview & {
        lead_id: string;
      })[])
        byLead.set(lead_id, preview);
      if (data.length < 1000) break;
    }
    for (const l of leads) {
      const preview = byLead.get(l.id);
      if (preview) l.preview = preview;
    }
  } catch {
    // Previews are optional: the workspace loads without them.
  }
}
export async function getLead(db: SupabaseClient, id: string): Promise<Lead> {
  const { data, error } = await db
    .from("leads")
    .select("*, sources:lead_sources(*), messages(*), events:lead_events(*)")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Lead non trovato");
  const l = data as Lead;
  l.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  l.events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  await attachPreviews(db, [l]);
  return l;
}
export async function getWorkspace(
  db: SupabaseClient,
  userId: string,
): Promise<Workspace> {
  const [leads, preferences] = await Promise.all([
    allLeads(db),
    getPreferences(db, userId),
  ]);
  return { leads, preferences };
}
export async function getPreferences(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();
  if (error) throw new Error("Profilo non disponibile: verifica la migrazione");
  return preferencesSchema.parse(data?.preferences || {});
}
export async function saveLead(
  db: SupabaseClient,
  l: Lead,
  expected: string | null = null,
) {
  const { data, error } = await db.rpc("save_lead", {
    p_lead: l,
    p_keys: dedupKeys(l),
    p_expected: expected,
  });
  if (error)
    throw new Error(
      error.message.includes("Conflict")
        ? "Lead modificato in un’altra scheda: aggiorna la pagina"
        : "Salvataggio non riuscito. Verifica migrazione e connessione.",
    );
  return data as { id: string; duplicate: boolean };
}
export async function dismissedKeys(db: SupabaseClient) {
  const keys: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("dismissed_keys")
      .select("key")
      .range(offset, offset + 999);
    // Before migration 002 there is nothing to skip.
    if (error) return keys;
    keys.push(...data.map((row) => row.key as string));
    if (data.length < 1000) return keys;
  }
}
export async function deleteLeads(
  db: SupabaseClient,
  ids: string[],
  remember: boolean,
) {
  const { data, error } = await db.rpc("delete_leads", {
    p_ids: ids,
    p_remember: remember,
  });
  if (error)
    throw new Error(
      "Cancellazione non disponibile: esegui la migrazione 002 su Supabase",
    );
  return (data || []) as string[];
}
/**
 * Every lead goes, contacted ones included, except opt-outs: those are what
 * stops anyone writing again to who asked not to be contacted. All keys are
 * remembered first, so no future search proposes these places again.
 */
export async function deleteAllLeads(db: SupabaseClient, userId: string) {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("leads")
      .select("id")
      .eq("do_not_contact", false)
      .range(offset, offset + 999);
    if (error || !data) throw new Error("Impossibile leggere i lead");
    ids.push(...data.map((row: { id: string }) => row.id));
    if (data.length < 1000) break;
  }
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: keys, error: keysError } = await db
      .from("lead_keys")
      .select("key")
      .in("lead_id", chunk);
    if (keysError || !keys) throw new Error("Impossibile leggere i lead");
    if (keys.length) {
      const { error } = await db.from("dismissed_keys").upsert(
        keys.map((k: { key: string }) => ({ user_id: userId, key: k.key })),
        { onConflict: "user_id,key", ignoreDuplicates: true },
      );
      if (error) throw new Error("Cancellazione non riuscita");
    }
    const { error } = await db.from("leads").delete().in("id", chunk);
    if (error) throw new Error("Cancellazione non riuscita");
  }
  return ids;
}
