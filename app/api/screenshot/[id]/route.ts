import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { publicConfig } from "@/lib/config";
import { getLead } from "@/lib/supabase/repository";
import { screenshotProvider } from "@/lib/providers/screenshot";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (publicConfig().demo) return new NextResponse(null, { status: 403 });
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return new NextResponse(null, { status: 401 });
    const { data: allowed, error } = await db.rpc("consume_rate", {
      p_bucket: "expensive",
    });
    if (error || !allowed) return new NextResponse(null, { status: 429 });
    const l = await getLead(db, (await params).id);
    if (l.is_demo || !l.website_url)
      return new NextResponse(null, { status: 404 });
    const bytes = await screenshotProvider().capture(l.website_url);
    return bytes
      ? new NextResponse(Buffer.from(bytes), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=3600",
          },
        })
      : new NextResponse(null, { status: 404 });
  } catch {
    return NextResponse.json(
      {
        error: "Screenshot non disponibile. Rimane disponibile l’analisi HTML.",
      },
      { status: 502 },
    );
  }
}
