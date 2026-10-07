/** "buongiorno" until 13:59, "buonasera" from 14:00, by the clock in Italy. */
export function timeGreeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 5 && hour < 14 ? "buongiorno" : "buonasera";
}
/**
 * A draft written in the morning and sent in the evening must not open with
 * "buongiorno": the opening line's greeting follows the time it is sent.
 */
export function fixGreeting(text: string, now = new Date()) {
  const [first, ...rest] = text.split("\n");
  const word = timeGreeting(now);
  const fixed = first.replace(/\bbuon(?:giorno|asera|pomeriggio)\b/i, (hit) =>
    hit[0] === "B" ? word[0].toUpperCase() + word.slice(1) : word,
  );
  return [fixed, ...rest].join("\n");
}
