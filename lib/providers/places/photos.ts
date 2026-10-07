import "server-only";
import { providerJson } from "../http";

export type PlacePhoto = { url: string; author: string; authorUrl: string };
type Photo = {
  name: string;
  authorAttributions?: { displayName?: string; uri?: string }[];
};
const photoName = /^places\/[\w-]+\/photos\/[\w-]+$/;
/**
 * Photos are loaded live on every visit and never stored, as Google requires,
 * always with their authors. Listing them is free; each photo is billed.
 */
export async function placePhotos(
  placeId: string,
  max = 5,
): Promise<PlacePhoto[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !placeId || placeId.startsWith("demo-")) return [];
  try {
    const details = (await providerJson(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" } },
    )) as { photos?: Photo[] };
    const photos = (details?.photos || [])
      .filter((p) => photoName.test(p.name))
      .slice(0, max);
    const loaded = await Promise.all(
      photos.map(async (p) => {
        try {
          const media = (await providerJson(
            `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=1200&skipHttpRedirect=true`,
            { headers: { "X-Goog-Api-Key": key } },
          )) as { photoUri?: string };
          const author = p.authorAttributions?.[0];
          return media?.photoUri?.startsWith("https://")
            ? {
                url: media.photoUri,
                author: author?.displayName || "",
                authorUrl: author?.uri || "",
              }
            : null;
        } catch {
          return null;
        }
      }),
    );
    return loaded.filter((p): p is PlacePhoto => !!p);
  } catch {
    return [];
  }
}
