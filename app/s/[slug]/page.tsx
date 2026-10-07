import type { Metadata } from "next";
import { headers } from "next/headers";
import { publicConfig } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import { demoPreview } from "@/lib/demo";
import { isPreviewBot, placeLabel, type SiteContent } from "@/lib/site-preview";
import { placePhotos } from "@/lib/providers/places/photos";
import {
  PreviewUnavailable,
  SitePreviewPage,
  type PreviewSender,
} from "@/components/site-preview";

export const dynamic = "force-dynamic";
type Preview = {
  content: SiteContent;
  place_id: string;
  sender: PreviewSender;
  from_google?: boolean;
};
/** Public read through the secret link only; counting is the database's job. */
async function load(slug: string, count: boolean): Promise<Preview | null> {
  if (!/^[a-z0-9-]{4,40}$/.test(slug)) return null;
  if (publicConfig().demo) return demoPreview(slug);
  try {
    const db = await supabaseServer();
    const { data, error } = await db.rpc("site_preview", {
      p_slug: slug,
      p_count: count,
    });
    return error ? null : ((data as Preview | null) ?? null);
  } catch {
    return null;
  }
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = await load((await params).slug, false);
  return {
    title: p
      ? `${p.content.name} · ${placeLabel(p.content.category)} a ${p.content.city}`
      : "Anteprima non disponibile",
    description: p?.content.copy.intro,
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const agent = (await headers()).get("user-agent") || "";
  const p = await load((await params).slug, !isPreviewBot(agent));
  if (!p) return <PreviewUnavailable />;
  // The database hands out the place only to real visitors within the hourly budget.
  const photos = await placePhotos(p.place_id);
  return (
    <SitePreviewPage
      content={p.content}
      sender={p.sender}
      photos={photos}
      fromGoogle={!!p.from_google}
    />
  );
}
