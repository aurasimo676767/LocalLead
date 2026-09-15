import "server-only";
import { resolvePublic } from "../http";
export interface ScreenshotProvider {
  capture(url: string): Promise<Uint8Array | null>;
}
class ScreenshotOne implements ScreenshotProvider {
  async capture(url: string) {
    await resolvePublic(url);
    const params = new URLSearchParams({
      access_key: process.env.SCREENSHOT_API_KEY!,
      url,
      format: "png",
      viewport_width: "1280",
      viewport_height: "900",
      block_ads: "true",
      block_cookie_banners: "true",
      timeout: "15",
    });
    const res = await fetch(`https://api.screenshotone.com/take?${params}`, {
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/"))
      throw new Error("Screenshot non disponibile");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 5_000_000) throw new Error("Screenshot troppo grande");
    return bytes;
  }
}
export const screenshotProvider = (): ScreenshotProvider =>
  process.env.SCREENSHOT_PROVIDER === "screenshotone" &&
  process.env.SCREENSHOT_API_KEY
    ? new ScreenshotOne()
    : { capture: async () => null };
