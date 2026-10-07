// Google's Italian weekday descriptions, e.g. "martedì: 12:00–15:00, 19:00–23:30".
const days = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];
type Range = { from: number; to: number; label: string };
const minutes = (h: string, m: string) => Number(h) * 60 + Number(m);
const pad = (n: number) =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
function dayLine(hours: string[], day: number) {
  const name = days[day];
  return hours.find((h) =>
    h.trim().toLocaleLowerCase("it").startsWith(`${name}:`),
  );
}
function ranges(line: string | undefined): Range[] | "all" | null {
  if (!line) return null;
  if (/24\s*ore/i.test(line)) return "all";
  const found = [
    ...line.matchAll(/(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})/g),
  ].map(([, h1, m1, h2, m2]) => {
    const from = minutes(h1, m1);
    let to = minutes(h2, m2);
    if (to <= from) to += 24 * 60;
    return { from, to, label: pad(to) };
  });
  return found.length ? found : /chius/i.test(line) ? [] : null;
}
/** Day and minutes of the day in Italy, whatever the server's clock zone. */
function romeNow(now: Date) {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    day: days.indexOf(get("weekday").toLocaleLowerCase("it")),
    at: minutes(get("hour"), get("minute")),
  };
}
/**
 * "Aperto ora, fino alle 23:30" or "Apriamo oggi alle 19:00", read from the
 * real Google hours. Nothing when closed or when the hours can't be read: a
 * preview never claims more than the data says.
 */
export function openStatus(
  hours: string[],
  now = new Date(),
): { open: boolean; text: string } | null {
  if (!hours.length) return null;
  const { day, at } = romeNow(now);
  if (day < 0) return null;
  const today = ranges(dayLine(hours, day));
  const yesterday = ranges(dayLine(hours, (day + 6) % 7));
  if (Array.isArray(yesterday)) {
    const late = yesterday.find((r) => r.to > 24 * 60 && at < r.to - 24 * 60);
    if (late)
      return { open: true, text: `Aperto ora, fino alle ${late.label}` };
  }
  if (today === "all") return { open: true, text: "Aperto ora" };
  if (!Array.isArray(today)) return null;
  const now_ = today.find((r) => at >= r.from && at < r.to);
  if (now_) return { open: true, text: `Aperto ora, fino alle ${now_.label}` };
  const next = today.find((r) => r.from > at);
  return next
    ? { open: false, text: `Apriamo oggi alle ${pad(next.from)}` }
    : null;
}
