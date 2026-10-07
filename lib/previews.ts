import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, SitePreview } from "./model";
import { newSlug, siteContent, type SiteContent } from "./site-preview";
import { generateSiteCopy } from "./ai/site-copy";

const LIFETIME_DAYS = 60;
const columns = "slug,views,last_viewed_at,expires_at";
const expiry = () =>
  new Date(Date.now() + LIFETIME_DAYS * 86_400_000).toISOString();
/**
 * The lead's public preview, created on first use. Rewriting a draft keeps the
 * link and the texts, refreshes the facts and the expiry. Any failure (for
 * example migration 003 not run yet) gives null: the draft goes out without it.
 */
export async function ensurePreview(
  db: SupabaseClient,
  lead: Lead,
): Promise<SitePreview | null> {
  try {
    const { data: existing, error } = await db
      .from("site_previews")
      .select(`${columns},content`)
      .eq("lead_id", lead.id)
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      const copy =
        (existing.content as SiteContent | null)?.copy ||
        (await generateSiteCopy(lead));
      const expires_at = expiry();
      const { error: updateError } = await db
        .from("site_previews")
        .update({ content: siteContent(lead, copy), expires_at })
        .eq("slug", existing.slug);
      if (updateError) throw updateError;
      return {
        slug: existing.slug,
        views: existing.views,
        last_viewed_at: existing.last_viewed_at,
        expires_at,
      };
    }
    const copy = await generateSiteCopy(lead);
    const { data, error: insertError } = await db
      .from("site_previews")
      .insert({
        slug: newSlug(),
        lead_id: lead.id,
        user_id: lead.user_id,
        content: siteContent(lead, copy),
        expires_at: expiry(),
      })
      .select(columns)
      .single();
    if (insertError || !data) throw insertError;
    return {
      slug: data.slug,
      views: data.views,
      last_viewed_at: data.last_viewed_at,
      expires_at: data.expires_at,
    };
  } catch (e) {
    console.warn("[preview] not available", {
      id: lead.id,
      error:
        e instanceof Error ? e.message : (e as { message?: string })?.message,
    });
    return null;
  }
}
