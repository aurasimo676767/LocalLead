import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Lead, type Workspace, preferencesSchema } from "../model";
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
  return rows;
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
  return l;
}
export async function getWorkspace(
  db: SupabaseClient,
  userId: string,
): Promise<Workspace> {
  const leads = await allLeads(db);
  const { data, error } = await db
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();
  if (error) throw new Error("Profilo non disponibile: verifica la migrazione");
  return {
    leads,
    preferences: preferencesSchema.parse(data?.preferences || {}),
  };
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
