/* eslint-disable @next/next/no-img-element -- Google photo URLs are live and change: next/image would cache them. */
import styles from "./site-preview.module.css";
import { interestUrl, placeLabel, type SiteContent } from "@/lib/site-preview";
import type { PlacePhoto } from "@/lib/providers/places/photos";
import { safeUrl } from "@/lib/utils";

export type PreviewSender = { name: string; phone: string; price: number };
const accents: Record<string, string> = {
  Pizzeria: "#c2410c",
  Panineria: "#b45309",
  Ristorante: "#b91c1c",
  Bar: "#92400e",
  Pub: "#7c2d12",
  "Cocktail bar": "#6d28d9",
  Pasticceria: "#be185d",
  Gelateria: "#0e7490",
  Panificio: "#a16207",
  Gastronomia: "#9a3412",
  Rosticceria: "#c2410c",
  "B&B": "#0f766e",
  "Casa vacanza": "#1d4ed8",
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
/** The site Simone would build, filled with the venue's own public facts. */
export function SitePreviewPage({
  content: c,
  sender,
  photos,
  fromGoogle = false,
}: {
  content: SiteContent;
  sender: PreviewSender;
  photos: PlacePhoto[];
  // Facts come from Google Places: credit it even without photos.
  fromGoogle?: boolean;
}) {
  const lodging = c.sector === "alloggi";
  const products = productCategories.includes(c.category);
  const phone = c.phone.replace(/[^\d+]/g, "");
  const directions =
    safeUrl(c.maps_url) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${c.address || c.city}`)}`;
  const menu = lodging ? "" : safeUrl(c.menu_url);
  const socials = [
    ["Facebook", safeUrl(c.facebook_url)],
    ["Instagram", safeUrl(c.instagram_url)],
  ].filter(([, url]) => url);
  const interest = interestUrl(sender.phone, sender.name, c.name);
  const [hero, ...rest] = photos;
  const gallery = rest.slice(0, 4);
  const authors = photos.filter((p) => p.author);
  return (
    <div
      className={styles.page}
      style={
        { "--accent": accents[c.category] || "#9a3412" } as React.CSSProperties
      }
    >
      <header
        className={hero ? styles.hero : `${styles.hero} ${styles.heroPlain}`}
      >
        {hero && (
          <img
            src={hero.url}
            alt={`Foto di ${c.name}`}
            className={styles.heroImage}
            referrerPolicy="no-referrer"
          />
        )}
        <div className={styles.heroShade} />
        <div className={styles.heroText}>
          <p className={styles.kicker}>
            {placeLabel(c.category)} a {c.city}
          </p>
          <h1>{c.name}</h1>
          <p className={styles.title}>{c.copy.title}</p>
          <div className={styles.actions}>
            {phone && (
              <a className={styles.primary} href={`tel:${phone}`}>
                Chiama
              </a>
            )}
            <a
              className={styles.secondary}
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
            >
              Indicazioni
            </a>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <p className={styles.intro}>{c.copy.intro}</p>
        <section>
          <h2>{lodging ? "Gli spazi" : "Un’occhiata da noi"}</h2>
          <div className={styles.gallery}>
            {gallery.length
              ? gallery.map((p) => (
                  <img
                    key={p.url}
                    src={p.url}
                    alt={`Foto di ${c.name}`}
                    referrerPolicy="no-referrer"
                  />
                ))
              : [0, 1, 2].map((n) => (
                  <div key={n} className={styles.photoSlot}>
                    Qui vanno le vostre foto
                  </div>
                ))}
          </div>
        </section>
        <section className={styles.card}>
          <h2>
            {lodging ? "Le camere" : products ? "Cosa prepariamo" : "Il menu"}
          </h2>
          <p>{c.copy.offer}</p>
          {menu ? (
            <a
              className={styles.primary}
              href={menu}
              target="_blank"
              rel="noopener noreferrer"
            >
              Guarda il menu
            </a>
          ) : (
            <div className={styles.slot}>
              {lodging
                ? "Qui vanno le vostre camere, con foto e prezzi"
                : products
                  ? "Qui vanno i vostri prodotti, con le foto"
                  : "Qui va il vostro menu"}
            </div>
          )}
        </section>
        {c.hours.length > 0 && (
          <section>
            <h2>Orari</h2>
            <ul className={styles.hours}>
              {c.hours.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
        )}
        <section className={styles.card}>
          <h2>{lodging ? "Scriveteci" : "Contatti"}</h2>
          <p>{c.copy.contact}</p>
          <ul className={styles.contacts}>
            {c.address && <li>{c.address}</li>}
            {phone && (
              <li>
                <a href={`tel:${phone}`}>{readablePhone(phone)}</a>
              </li>
            )}
            {socials.map(([label, url]) => (
              <li key={label}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              </li>
            ))}
          </ul>
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
          Anteprima creata da <strong>{sender.name || "Simone"}</strong> · il
          sito completo a <strong>{sender.price} €</strong>, una volta sola
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
    <div className={styles.page}>
      <main className={styles.unavailable}>
        <h1>Anteprima non disponibile</h1>
        <p>Il link è scaduto oppure non è più attivo.</p>
      </main>
    </div>
  );
}
