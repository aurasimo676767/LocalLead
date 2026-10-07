/* eslint-disable @next/next/no-img-element -- Google photo URLs are live and change: next/image would cache them. */
import { Big_Shoulders, Familjen_Grotesk } from "next/font/google";
import styles from "./site-preview.module.css";
import { PreviewMotion } from "./site-preview-motion";
import {
  interestUrl,
  placeLabel,
  previewLook,
  type SiteContent,
} from "@/lib/site-preview";
import { openStatus } from "@/lib/opening-hours";
import type { PlacePhoto } from "@/lib/providers/places/photos";
import { safeUrl } from "@/lib/utils";

const display = Big_Shoulders({ subsets: ["latin"], variable: "--sp-display" });
const body = Familjen_Grotesk({ subsets: ["latin"], variable: "--sp-body" });

export type PreviewSender = { name: string; phone: string; price: number };
// One warm accent per kind of place, nudged per link by previewLook().
const accents: Record<string, number> = {
  // oklch hues: 30 red-orange, 55 orange, 75 amber, 310 violet, 0 pink…
  Pizzeria: 45,
  Panineria: 55,
  Ristorante: 32,
  Bar: 75,
  Pub: 50,
  "Cocktail bar": 312,
  Pasticceria: 0,
  Gelateria: 210,
  Panificio: 80,
  Gastronomia: 42,
  Rosticceria: 50,
  "Altro food": 55,
  "B&B": 182,
  "Casa vacanza": 240,
};
const productCategories = [
  "Panificio",
  "Pasticceria",
  "Gastronomia",
  "Gelateria",
  "Rosticceria",
  "Altro food",
];
const readablePhone = (phone: string) =>
  phone.startsWith("+39")
    ? phone.slice(3).replace(/(\d{3})(?=\d)/g, "$1 ")
    : phone;
/** A tiny seeded generator: the same link always gets the same embers. */
function embers(seed: number, count: number) {
  let s = seed || 1;
  const next = () => ((s = (s * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  return Array.from({ length: count }, () => ({
    left: `${(next() * 100).toFixed(1)}%`,
    size: `${(2 + next() * 4).toFixed(1)}px`,
    delay: `${(next() * 6).toFixed(2)}s`,
    duration: `${(5 + next() * 6).toFixed(2)}s`,
    drift: `${((next() - 0.5) * 80).toFixed(0)}px`,
  }));
}
/** Splits a title into two or three lines for the lit-sign headline. */
function signLines(title: string) {
  const words = title.trim().split(/\s+/);
  if (words.length <= 2) return [title.trim()];
  const lines = words.length >= 6 ? 3 : 2;
  const per = Math.ceil(words.length / lines);
  return Array.from({ length: lines }, (_, i) =>
    words.slice(i * per, (i + 1) * per).join(" "),
  ).filter(Boolean);
}
const today = () =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
  }).format(new Date());

/** The site Simone would build, filled with the venue's own public facts. */
export function SitePreviewPage({
  content: c,
  sender,
  photos,
  fromGoogle = false,
  slug = "",
}: {
  content: SiteContent;
  sender: PreviewSender;
  photos: PlacePhoto[];
  // Facts come from Google Places: credit it even without photos.
  fromGoogle?: boolean;
  slug?: string;
}) {
  const lodging = c.sector === "alloggi";
  const products = productCategories.includes(c.category);
  const look = previewLook(slug || c.name);
  const hue = (accents[c.category] ?? 55) + look.hue;
  const phone = c.phone.replace(/[^\d+]/g, "");
  const directions =
    safeUrl(c.maps_url) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${c.address || c.city}`)}`;
  const menu = lodging ? "" : safeUrl(c.menu_url);
  const socials = [
    ["Facebook", safeUrl(c.facebook_url)],
    ["Instagram", safeUrl(c.instagram_url)],
  ].filter(([, url]) => url);
  const interest = interestUrl(sender.phone, sender.name);
  const [hero, ...rest] = photos;
  const gallery = rest.slice(0, 4);
  const authors = photos.filter((p) => p.author);
  const status = openStatus(c.hours);
  const lines = signLines(c.copy.title);
  const label = placeLabel(c.category);
  const sparks = embers(look.seed, lodging ? 10 : 18);
  const day = today();
  const band = [label, c.city, c.name].filter(Boolean);
  const offerTitle = lodging
    ? "Le camere"
    : products
      ? "Cosa prepariamo"
      : "Il menu";
  return (
    <div
      data-preview
      className={`${styles.page} ${display.variable} ${body.variable} ${lodging ? styles.calm : ""}`}
      style={
        {
          "--hue": hue,
          "--tilt": `${look.tilt}deg`,
        } as React.CSSProperties
      }
    >
      <PreviewMotion />
      <header className={styles.top}>
        <span className={styles.badge} aria-hidden="true">
          {c.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className={styles.brand}>{c.name}</span>
        {phone && (
          <a className={styles.callTop} href={`tel:${phone}`}>
            Chiamaci
          </a>
        )}
      </header>

      <section
        className={`${styles.hero} ${look.photoFirst ? styles.photoFirst : ""}`}
      >
        <div className={styles.glow} aria-hidden="true" />
        <div className={styles.embers} aria-hidden="true">
          {sparks.map((s, i) => (
            <i
              key={i}
              style={
                {
                  left: s.left,
                  width: s.size,
                  height: s.size,
                  animationDelay: s.delay,
                  animationDuration: s.duration,
                  "--drift": s.drift,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className={styles.heroText}>
          <p className={styles.place}>
            {label} a {c.city}
            {status && (
              <span
                className={`${styles.status} ${status.open ? styles.isOpen : ""}`}
              >
                {status.text}
              </span>
            )}
          </p>
          <h1 className={styles.sign} aria-label={c.copy.title}>
            {lines.map((line, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={
                  i === look.outlined % lines.length ? styles.outline : ""
                }
                style={{ animationDelay: `${0.25 + i * 0.32}s` }}
              >
                {line}
              </span>
            ))}
          </h1>
          <p className={styles.intro}>{c.copy.intro}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#offerta">
              {lodging ? "Guarda le camere" : "Guarda il menu"}
            </a>
            <a
              className={styles.ghost}
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
            >
              Indicazioni
            </a>
          </div>
        </div>
        <figure className={styles.photoCard} data-parallax>
          {hero ? (
            <img
              src={hero.url}
              alt={`Foto di ${c.name}`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={styles.photoEmpty}>
              Qui va la vostra foto più bella
            </div>
          )}
          <figcaption className={styles.tape}>{c.name}</figcaption>
        </figure>
      </section>

      <div className={styles.band} aria-hidden="true">
        <div className={styles.bandTrack}>
          {[0, 1, 2, 3].map((n) => (
            <span key={n}>
              {band.map((word) => (
                <em key={word}>{word}</em>
              ))}
            </span>
          ))}
        </div>
      </div>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 data-reveal className={styles.sectionTitle}>
            {lodging ? "Gli spazi" : "Un’occhiata da noi"}
          </h2>
          <div className={styles.gallery} data-reveal>
            {gallery.length
              ? gallery.map((p, i) => (
                  <figure
                    key={p.url}
                    style={{ transitionDelay: `${i * 90}ms` }}
                  >
                    <img
                      src={p.url}
                      alt={`Foto di ${c.name}`}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  </figure>
                ))
              : [0, 1, 2].map((n) => (
                  <figure
                    key={n}
                    className={styles.slotPhoto}
                    style={{ transitionDelay: `${n * 90}ms` }}
                  >
                    Qui vanno le vostre foto
                  </figure>
                ))}
          </div>
        </section>

        <section id="offerta" className={styles.section}>
          <h2 data-reveal className={styles.sectionTitle}>
            {offerTitle}
          </h2>
          <p data-reveal className={styles.lead}>
            {c.copy.offer}
          </p>
          {menu ? (
            <a
              data-reveal
              className={styles.primary}
              href={menu}
              target="_blank"
              rel="noopener noreferrer"
            >
              Apri il menu
            </a>
          ) : (
            <div className={styles.dishes}>
              {[0, 1, 2].map((n) => (
                <article
                  key={n}
                  data-reveal
                  className={styles.dish}
                  style={{ transitionDelay: `${n * 110}ms` }}
                >
                  <h3>
                    {lodging
                      ? "La vostra camera"
                      : products
                        ? "Il vostro prodotto"
                        : "Il vostro piatto"}
                  </h3>
                  <p>
                    {lodging
                      ? "Foto, letti e servizi della camera"
                      : "Ingredienti e una riga per raccontarlo"}
                  </p>
                  <span className={styles.price}>–,–– €</span>
                </article>
              ))}
              <p className={styles.example}>
                Esempio: qui vanno {lodging ? "le vostre camere" : "i vostri"}{" "}
                {lodging ? "con foto e prezzi" : "piatti con i prezzi"}.
              </p>
            </div>
          )}
        </section>

        {c.hours.length > 0 && (
          <section className={styles.section}>
            <h2 data-reveal className={styles.sectionTitle}>
              Orari
            </h2>
            <ul data-reveal className={styles.hours}>
              {c.hours.map((h) => {
                const [name, ...time] = h.split(":");
                return (
                  <li
                    key={h}
                    className={
                      name.trim().toLocaleLowerCase("it") === day
                        ? styles.today
                        : ""
                    }
                  >
                    <span>{name}</span>
                    <span>{time.join(":").trim()}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={`${styles.section} ${styles.contact}`}>
          <h2 data-reveal className={styles.sectionTitle}>
            {lodging ? "Scriveteci" : "Passa da noi"}
          </h2>
          <p data-reveal className={styles.lead}>
            {c.copy.contact}
          </p>
          <div data-reveal className={styles.contactRow}>
            {phone && (
              <a className={styles.primary} href={`tel:${phone}`}>
                {readablePhone(phone)}
              </a>
            )}
            <a
              className={styles.ghost}
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.address || "Indicazioni"}
            </a>
          </div>
          {socials.length > 0 && (
            <p className={styles.socials}>
              {socials.map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label}
                </a>
              ))}
            </p>
          )}
        </section>

        {fromGoogle && (
          <p className={styles.credits}>
            Informazioni da Google Maps.
            {authors.length > 0 && " Foto da Google Maps: "}
            {authors.map((p, i) => (
              <span key={p.url}>
                {i > 0 && ", "}
                {safeUrl(p.authorUrl) ? (
                  <a
                    href={safeUrl(p.authorUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.author}
                  </a>
                ) : (
                  p.author
                )}
              </span>
            ))}
          </p>
        )}
      </main>

      <footer className={styles.bar}>
        <p>
          <strong>Anteprima a solo scopo illustrativo.</strong> Il sito vero lo
          facciamo da zero, su misura, con il design e le animazioni che volete,
          a <strong>{sender.price} €</strong> una volta sola.
        </p>
        {interest && (
          <a
            className={styles.interest}
            href={interest}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mi interessa
          </a>
        )}
      </footer>
    </div>
  );
}
export function PreviewUnavailable() {
  return (
    <div
      className={`${styles.page} ${display.variable} ${body.variable}`}
      style={{ "--hue": 50 } as React.CSSProperties}
    >
      <main className={styles.unavailable}>
        <h1>Anteprima non disponibile</h1>
        <p>Il link è scaduto oppure non è più attivo.</p>
      </main>
    </div>
  );
}
