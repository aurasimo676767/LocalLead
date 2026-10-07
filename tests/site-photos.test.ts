import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ providerJson: vi.fn() }));
vi.mock("@/lib/providers/http", () => mocks);
import { placePhotos } from "@/lib/providers/places/photos";
import { demoPreview, demoWorkspace } from "@/lib/demo";
import { previewLink } from "@/lib/site-preview";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "offline-test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("live Google photos", () => {
  it("lists photos for free, then loads at most five with their authors", async () => {
    mocks.providerJson.mockImplementation(async (url: string) =>
      url.endsWith("/media?maxWidthPx=1200&skipHttpRedirect=true")
        ? { photoUri: `https://lh3.googleusercontent.com/${url.split("/")[7]}` }
        : {
            photos: Array.from({ length: 8 }, (_, i) => ({
              name: `places/abc/photos/p${i}`,
              authorAttributions: [
                {
                  displayName: `Autore ${i}`,
                  uri: `https://maps.google.com/u${i}`,
                },
              ],
            })),
          },
    );
    const photos = await placePhotos("abc");
    expect(photos).toHaveLength(5);
    expect(photos[0]).toEqual({
      url: "https://lh3.googleusercontent.com/p0",
      author: "Autore 0",
      authorUrl: "https://maps.google.com/u0",
    });
    const [detailsUrl, detailsInit] = mocks.providerJson.mock.calls[0];
    expect(detailsUrl).toBe("https://places.googleapis.com/v1/places/abc");
    expect(detailsInit.headers["X-Goog-FieldMask"]).toBe("photos");
    expect(mocks.providerJson).toHaveBeenCalledTimes(6);
  });
  it("ignores photo names that are not Google photo paths", async () => {
    mocks.providerJson.mockResolvedValueOnce({
      photos: [{ name: "../../evil" }],
    });
    expect(await placePhotos("abc")).toEqual([]);
    expect(mocks.providerJson).toHaveBeenCalledTimes(1);
  });
  it("makes no call without a key, a place or for demo places", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(await placePhotos("abc")).toEqual([]);
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "offline-test-key");
    expect(await placePhotos("")).toEqual([]);
    expect(await placePhotos("demo-place-0")).toEqual([]);
    expect(mocks.providerJson).not.toHaveBeenCalled();
  });
  it("shows the page without photos when Google fails", async () => {
    mocks.providerJson.mockRejectedValue(
      new Error("Provider: errore HTTP 500"),
    );
    expect(await placePhotos("abc")).toEqual([]);
  });
});

describe("demo previews", () => {
  it("serves a demo lead's preview without database or providers", () => {
    const p = demoPreview("demo-0");
    expect(p?.content.name).toBe("Forno delle Nuvole");
    expect(p?.content.copy.title.length).toBeGreaterThan(0);
    expect(p?.place_id).toBe("");
    expect(demoPreview("demo-99")).toBeNull();
    expect(demoPreview("abcdefghij12")).toBeNull();
  });
  it("gives contactable demo leads a preview link in the demo workspace", () => {
    // In the browser the app's own address is used; here it is configured.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const leads = demoWorkspace().leads;
    const forno = leads.find((l) => l.name === "Forno delle Nuvole")!;
    expect(previewLink(forno)).toMatch(/\/s\/demo-0$/);
    const closed = leads.find((l) => l.name === "Il Vecchio Girasole")!;
    expect(closed.preview).toBeFalsy();
  });
});
