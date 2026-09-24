import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Browser screenshots stay on this machine, next to the app, one pair per lead.
const dir = () => path.join(process.cwd(), ".locallead", "screenshots");
export type ScreenView = "desktop" | "mobile";
const file = (id: string, view: ScreenView) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("ID lead non valido");
  return path.join(dir(), `${id}-${view}.jpg`);
};

export async function saveScreen(id: string, view: ScreenView, bytes: Buffer) {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(id, view), bytes);
}

export async function readScreen(id: string, view: ScreenView) {
  try {
    return await readFile(file(id, view));
  } catch {
    return null;
  }
}
