import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { publicConfig } from "@/lib/config";
import { getLead } from "@/lib/supabase/repository";
import { screenshotProvider } from "@/lib/providers/screenshot";
import { readScreen } from "@/lib/enrichment/screens";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (publicConfig().demo) return new NextResponse(null, { status: 403 });
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return new NextResponse(null, { status: 401 });
    const view = request.nextUrl.searchParams.get("view");
    if (view === "desktop" || view === "mobile") {
      // Saved by the browser check; the lead lookup runs under the user's RLS.
      const l = await getLead(db, (await params).id);
      const bytes = await readScreen(l.id, view);
      return bytes
        ? new NextResponse(new Uint8Array(bytes), {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "private, max-age=86400",
            },
          })
        : new NextResponse(null, { status: 404 });
    }
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
