import { categories, type Lead } from "./model";

export type Sector = "locali" | "alloggi";
const lodgingCategories: readonly string[] = ["B&B", "Casa vacanza"];
export const sectorOf = (category: string): Sector =>
  lodgingCategories.includes(category) ? "alloggi" : "locali";
export const inSector =
  (sector: Sector) =>
  (l: Pick<Lead, "category">): boolean =>
    sectorOf(l.category) === sector;
export const sectorCategories = (sector: Sector): Lead["category"][] =>
  categories.filter((c) => sectorOf(c) === sector);
// Google Places types. A B&B is often also typed "hotel": the B&B type wins.
const stayTypes = [
  "bed_and_breakfast",
  "guest_house",
  "private_guest_room",
  "cottage",
  "farmstay",
];
const hotelTypes = [
  "hotel",
  "resort_hotel",
  "motel",
  "hostel",
  "campground",
  "extended_stay_hotel",
];
export function isLodging(types: string[] = []) {
  if (types.some((t) => stayTypes.includes(t))) return true;
  if (types.some((t) => hotelTypes.includes(t))) return false;
  return types.includes("lodging") || types.includes("inn");
}
