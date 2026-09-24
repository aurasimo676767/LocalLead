"use client";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { Lead } from "@/lib/model";
import { safeUrl } from "@/lib/utils";

const quality: Record<Lead["website_quality"], string> = {
  excellent: "Sito ottimo",
  good: "Sito buono",
  average: "Sito nella media",
  poor: "Sito scarso",
  broken: "Sito con errori",
  unknown: "Da verificare",
};
const yes = (value: boolean) => (value ? "Sì" : "No");
const hosts = (urls: string[]) =>
  [...new Set(urls.map((u) => new URL(u).hostname.replace(/^www\./, "")))]
    .slice(0, 3)
    .join(", ");

/** What the browser check saw on the homepage: screenshots, problems and facts. */
export function SiteAuditPanel({ lead: l }: { lead: Lead }) {
  const a = l.analysis.site_audit;
  if (!a) return null;
  const review = a.review;
  const findings = l.analysis.evidence.filter((e) =>
    ["site_issue", "site_ads"].includes(e.kind),
  );
  const shot = (view: "desktop" | "mobile") =>
    `/api/screenshot/${l.id}?view=${view}&t=${encodeURIComponent(a.checked_at)}`;
  const facts: [string, string][] = [
    [
      "Caricamento",
      a.load_ms === null
        ? "Non completato"
        : `${(a.load_ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s`,
    ],
    [
      "Pubblicità",
      a.ads.slots
        ? `${a.ads.slots} spazi${a.ads.networks.length ? ` (${a.ads.networks.join(", ")})` : ""}`
        : a.ads.networks.length
          ? `Script: ${a.ads.networks.join(", ")}`
          : "Nessuna",
    ],
    ["Popup all’apertura", a.popups ? `${a.popups}` : "Nessuno"],
    ["Banner cookie", yes(a.cookie_banner)],
    [
      "Da telefono",
      !a.mobile
        ? "Non misurato"
        : !a.mobile.viewport
          ? "Non adattato"
          : a.mobile.page_width > a.mobile.screen_width + 8
            ? `Esce dallo schermo (${a.mobile.page_width}px)`
            : "Adattato",
    ],
    [
      "Testo piccolo da telefono",
      a.mobile ? `${a.mobile.small_text_pct}%` : "Non misurato",
    ],
    ["HTTPS", yes(a.https)],
    [
      "Immagini",
      `${a.image_count}${a.broken_images ? `, ${a.broken_images} non caricate` : ""}`,
    ],
    ["Testo in homepage", `${a.word_count} parole`],
    ["Ultimo ©", a.copyright_year ? String(a.copyright_year) : "Non indicato"],
    ["Realizzato con", a.technologies.join(", ") || "Non riconosciuto"],
    [
      "Menu",
      a.menu.pdf_only
        ? "Solo PDF"
        : a.menu.links.length
          ? "Link presente"
          : a.menu.on_page
            ? "Nella pagina"
            : "Non trovato",
    ],
    ["Prenotazioni online", hosts(a.booking_links) || "No"],
    ["Ordini online", hosts(a.ordering_links) || "No"],
    ["Link WhatsApp", yes(a.whatsapp_link)],
    ["Telefono cliccabile", yes(a.tel_link)],
    ["Email", yes(a.email_link)],
    ["Mappa", yes(a.map_embed)],
    ["Social collegati", hosts(a.social_links) || "Nessuno"],
    ["Errori tecnici", a.console_errors ? `${a.console_errors}` : "Nessuno"],
  ];
  return (
    <section className="panel site-audit">
      <div className="panel-title">
        <h2>Analisi del sito</h2>
        {safeUrl(a.final_url) && (
          <a
            className="text-button push-right"
            href={a.final_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apri il sito <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      <div className="site-verdict">
        <span className={`quality quality-${l.website_quality}`}>
          {quality[l.website_quality]}
        </span>
        {review && (
          <span className="ai-verdict">
            Giudizio AI: {review.verdict}, {review.score}/10
          </span>
        )}
      </div>
      {review?.summary && <p className="site-summary">{review.summary}</p>}
      {(a.screenshots.desktop || a.screenshots.mobile) && (
        <div className="site-shots">
          {a.screenshots.desktop && (
            <figure>
              <a href={shot("desktop")} target="_blank" rel="noopener">
                <Image
                  unoptimized
                  width={1366}
                  height={800}
                  src={shot("desktop")}
                  alt={`Homepage di ${l.name} da computer`}
                />
              </a>
              <figcaption>Computer</figcaption>
            </figure>
          )}
          {a.screenshots.mobile && (
            <figure className="phone">
              <a href={shot("mobile")} target="_blank" rel="noopener">
                <Image
                  unoptimized
                  width={390}
                  height={844}
                  src={shot("mobile")}
                  alt={`Homepage di ${l.name} da telefono`}
                />
              </a>
              <figcaption>Telefono</figcaption>
            </figure>
          )}
        </div>
      )}
      <div className="site-columns">
        <div>
          <h3>Problemi misurati</h3>
          <ul className="site-list">
            {findings.map((e) => (
              <li key={e.id}>{e.text}</li>
            ))}
            {!findings.length && (
              <li className="ok">Nessun problema misurato</li>
            )}
          </ul>
        </div>
        {review && (
          <div>
            <h3>Secondo l’AI</h3>
            <ul className="site-list">
              {review.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
              {review.strengths.map((p) => (
                <li key={p} className="ok">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <dl className="site-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        Controllato il {new Date(a.checked_at).toLocaleString("it-IT")} con un
        browser, da computer e da telefono.
        {review &&
          " Il giudizio AI è un’opinione sugli screenshot e non cambia il punteggio."}
      </p>
    </section>
  );
}
