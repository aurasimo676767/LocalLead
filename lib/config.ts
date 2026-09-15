import "server-only";
import type { PublicConfig } from "./model";
export function publicConfig(): PublicConfig {
  const auth = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const demo = process.env.DEMO_MODE === "true" || !auth;
  return {
    demo,
    auth,
    places:
      !demo && process.env.GOOGLE_PLACES_API_KEY
        ? "Google Places"
        : "Demo (dati fittizi)",
    search:
      !demo &&
      process.env.SEARCH_PROVIDER === "brave" &&
      process.env.SEARCH_API_KEY
        ? "Brave Search"
        : "Inserimento manuale",
    screenshot:
      !demo &&
      process.env.SCREENSHOT_PROVIDER === "screenshotone" &&
      process.env.SCREENSHOT_API_KEY
        ? "ScreenshotOne"
        : "Analisi HTML",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    ai: !demo && !!process.env.OPENAI_API_KEY,
  };
}
