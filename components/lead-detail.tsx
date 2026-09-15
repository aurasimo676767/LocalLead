"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  RefreshCw,
  MessageCircle,
  MessageSquare as Facebook,
  Check,
  Pencil,
  ShieldCheck,
  ExternalLink,
  X,
  Camera,
} from "lucide-react";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, Score, Status, ErrorText, Field } from "./ui";
import { LeadForm } from "./lead-form";
import { statuses, statusLabels, contactable, type Lead } from "@/lib/model";
import { hotReasons, worthwhile } from "@/lib/scoring";
import { safeUrl, whatsappUrl, whatsappCheckUrl } from "@/lib/utils";
const labels: Record<string, string> = {
  none: "Assente (verificato)",
  own_website: "Sito proprietario",
  external_page_only: "Solo pagina esterna",
  social_only: "Solo social",
  broken: "Errore rilevato",
  unknown: "Da verificare",
  excellent: "Ottimo",
  good: "Buono",
  average: "Nella media",
  poor: "Migliorabile",
  confirmed_business: "Business confermato",
  likely_business: "Probabile business",
  uncertain: "Numero da verificare",
  not_available: "Non disponibile",
  pdf: "PDF",
  external_platform: "Piattaforma esterna",
  delivery_platform: "Delivery",
  instagram_only: "Solo Instagram",
  facebook_only: "Solo Facebook",
};
function UrlRow({
  label,
  url,
  detail,
  demo,
}: {
  label: string;
  url: string;
  detail?: string;
  demo: boolean;
}) {
  return (
    <div className="presence-row">
      <span>{label}</span>
      <div>
        {url && safeUrl(url) ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {demo ? "Link demo" : new URL(url).hostname}
            <ArrowUpRight size={13} />
          </a>
        ) : (
          <span className="muted">Non disponibile</span>
        )}
        {detail && <small>{labels[detail] || detail}</small>}
      </div>
    </div>
  );
}
export function LeadDetail({ id }: { id: string }) {
  const { leads } = useWorkspace();
  const lead = leads.find((l) => l.id === id);
  return lead ? (
    <Detail key={id} lead={lead} />
  ) : (
    <div className="empty-state">
      <h2>Lead non trovato</h2>
      <Link href="/leads">Torna ai lead</Link>
    </div>
  );
}
function Detail({ lead: l }: { lead: Lead }) {
  const { command, notify, config } = useWorkspace();
  const task = useTask();
  const [text, setText] = useState(l.messages.at(-1)?.text || "");
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [channel, setChannel] = useState("WhatsApp");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState(l.status);
  const [verifyUrl, setVerifyUrl] = useState("");
  const [verifyNote, setVerifyNote] = useState("");
  const [wa, setWa] = useState(l.whatsapp_confidence);
  const [site, setSite] = useState(l.website_status);
  const [screenshot, setScreenshot] = useState("");
  const blocked = !contactable(l);
  const canWa = !blocked && !!whatsappUrl(l, text) && !l.is_demo;
  const canCheckWa = !blocked && !!whatsappCheckUrl(l, text) && !l.is_demo;
  const hasFb = !blocked && !!l.facebook_url && !l.is_demo;
  async function saveDraft() {
    if (text.trim() && text !== l.messages.at(-1)?.text)
      await command("save_message", { text }, l.id);
  }
  async function copy() {
    await navigator.clipboard.writeText(text);
    notify("Messaggio copiato");
  }
  return (
    <>
      <Link href="/leads" className="back-link">
        <ArrowLeft size={15} /> Tutti i lead
      </Link>
      <PageHeading
        eyebrow={`${l.category.toUpperCase()} · ${l.city.toUpperCase()}`}
        title={l.name}
        description={l.address || "Indirizzo da completare"}
      >
        <Status lead={l} />
        <Score value={l.lead_score} large />
        <button className="button secondary" onClick={() => setEdit(!edit)}>
          <Pencil size={15} /> Modifica
        </button>
      </PageHeading>
      {edit && <LeadForm lead={l} onSaved={() => setEdit(false)} />}
      <ErrorText text={task.error} />
      {l.do_not_contact && (
        <div className="note danger">
          Questo lead è escluso. Non apparirà più nelle nuove ricerche e i
          pulsanti di contatto sono disabilitati.
        </div>
      )}
      {l.is_demo && (
        <div className="note">
          Attività fittizia. Puoi provare analisi, messaggi e CRM; i contatti
          esterni della fixture sono disabilitati. Per provare un link reale,
          aggiungi un lead manuale.
        </div>
      )}
      <div className="detail-layout">
        <div className="detail-primary">
          <section className="panel">
            <div className="panel-title">
              <span className="section-number">01</span>
              <h2>L’opportunità, in chiaro</h2>
              <button
                className="icon-btn push-right"
                title="Analizza lead (cache 72 ore)"
                aria-label="Analizza lead"
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await command("analyze", undefined, l.id);
                    notify("Analisi aggiornata o recuperata dalla cache");
                  })
                }
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="analysis-highlight">
              <span>PROBLEMA PRINCIPALE</span>
              <h3>{l.main_problem}</h3>
              <p>{l.opportunity}</p>
            </div>
            <h4>Perché è un buon lead</h4>
            <ul className="reasons detailed">
              {hotReasons(l).map((r) => (
                <li key={r.label}>
                  <Check size={15} />
                  <span>{r.label}</span>
                  <b>+{r.points}</b>
                </li>
              ))}
              {!hotReasons(l).length && (
                <li>Nessuna opportunità sufficientemente documentata.</li>
              )}
            </ul>
            <div className="confidence">
              <span>Affidabilità delle evidenze</span>
              <strong>{l.confidence_score}%</strong>
              <div>
                <i style={{ width: `${l.confidence_score}%` }} />
              </div>
            </div>
            {l.ai_summary && <p className="ai-summary">{l.ai_summary}</p>}
            <details>
              <summary>Come viene calcolato lo score</summary>
              <p className="muted">
                Base: 20 punti. Solo evidenze con confidence ≥ 70%. Risultato
                limitato a 0–100.
              </p>
              {l.analysis.reasons.map((r, i) => (
                <div className="score-breakdown" key={i}>
                  <span>{r.label}</span>
                  <b>
                    {r.points > 0 ? "+" : ""}
                    {r.points}
                  </b>
                </div>
              ))}
            </details>
            {l.analysis.warnings.map((w, i) => (
              <div className="note" key={i}>
                {w}
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-title">
              <span className="section-number">02</span>
              <h2>Una conversazione possibile</h2>
              <span className="tag push-right">Bozza editabile</span>
            </div>
            <p className="muted">
              Rileggi, aggiungi la tua voce e scegli il canale.
            </p>
            <textarea
              aria-label="Messaggio suggerito"
              className="message-editor"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                worthwhile(l)
                  ? "Genera una prima bozza personalizzata…"
                  : "Verifica un’opportunità concreta prima di generare un messaggio."
              }
            />
            <div className="message-meta">
              <span>{text.length} caratteri · ideale 180–450</span>
              <span>{l.messages.at(-1)?.model || "Nessuna bozza"}</span>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                disabled={task.busy || !worthwhile(l)}
                onClick={() =>
                  void task.run(async () => {
                    await saveDraft();
                    const r = await command("message", undefined, l.id);
                    setText(r.lead?.messages.at(-1)?.text || "");
                  })
                }
              >
                <RefreshCw size={15} /> {text ? "Rigenera" : "Genera messaggio"}
              </button>
              <button
                className="button secondary"
                disabled={!text.trim() || task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await saveDraft();
                    notify("Bozza salvata nella cronologia");
                  })
                }
              >
                Salva bozza
              </button>
              <button
                className="button secondary"
                disabled={!text.trim()}
                onClick={() => void task.run(copy)}
              >
                <Copy size={15} /> Copia messaggio
              </button>
            </div>
            <div className="contact-actions">
              <button
                className="button"
                disabled={!canWa || !text.trim() || task.busy}
                onClick={() => setConfirm(true)}
              >
                <MessageCircle size={17} /> Apri WhatsApp
              </button>
              {l.whatsapp_confidence === "uncertain" && (
                <button
                  className="button secondary"
                  disabled={!canCheckWa || !text.trim() || task.busy}
                  onClick={() => setConfirm(true)}
                >
                  <MessageCircle size={17} /> Verifica su WhatsApp
                </button>
              )}
              <button
                className="button secondary"
                disabled={!hasFb || !text.trim() || task.busy}
                onClick={() => {
                  const win = window.open("about:blank", "_blank");
                  if (win) win.opener = null;
                  void task.run(async () => {
                    try {
                      await copy();
                      await saveDraft();
                      if (win) win.location.href = safeUrl(l.facebook_url);
                      else
                        notify(
                          "Popup bloccato: usa il link Facebook nella presenza online",
                        );
                    } catch (e) {
                      win?.close();
                      throw e;
                    }
                  });
                }}
              >
                <Facebook size={16} /> Apri Facebook
              </button>
            </div>
            {l.whatsapp_confidence === "uncertain" && (
              <p className="muted">
                Numero da verificare: conferma la fonte pubblica prima di usare
                WhatsApp.
              </p>
            )}
            <p className="microcopy">
              <ShieldCheck size={14} /> L’app apre il servizio. Controlli il
              messaggio e premi tu Invio.
            </p>
          </section>
          <section className="panel">
            <div className="panel-title">
              <span className="section-number">03</span>
              <h2>Fonti ed evidenze</h2>
            </div>
            {!l.analysis.evidence.length && (
              <p className="muted">
                Nessuna evidenza raccolta. Aggiungi link o avvia l’analisi.
              </p>
            )}
            {l.analysis.evidence.map((e) => (
              <div className="evidence" key={e.id}>
                <div>
                  <strong>{e.text}</strong>
                  <small>
                    {Math.round(e.confidence * 100)}% confidence · {e.kind}
                  </small>
                </div>
                {safeUrl(e.url) && (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Fonte: ${e.text}`}
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            ))}
            <details>
              <summary>Tutte le fonti ({l.sources.length})</summary>
              {l.sources.map((s) => (
                <div className="source" key={s.id}>
                  <div>
                    <span className="tag">{s.source_type}</span>
                    <small>Confidence {Math.round(s.confidence * 100)}%</small>
                  </div>
                  <a
                    href={safeUrl(s.url) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.url}
                  </a>
                  {s.metadata_json.requires_verification === true && (
                    <p>
                      Candidato da verificare: controlla identità e città, poi
                      aggiungi il link con “Modifica”.
                    </p>
                  )}
                  {typeof s.metadata_json.snippet === "string" && (
                    <small>{s.metadata_json.snippet}</small>
                  )}
                </div>
              ))}
            </details>
            {l.analysis.features && (
              <details>
                <summary>Controlli HTML (non un audit visivo)</summary>
                <dl className="feature-grid">
                  {Object.entries(l.analysis.features)
                    .filter(([k]) => k !== "excerpt")
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>
                          {Array.isArray(v)
                            ? v.join(" · ") || "—"
                            : typeof v === "boolean"
                              ? v
                                ? "Sì"
                                : "No"
                              : String(v) || "—"}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
            )}
            {config.screenshot === "ScreenshotOne" &&
              l.website_url &&
              !l.is_demo && (
                <>
                  <button
                    className="button secondary"
                    disabled={task.busy}
                    onClick={() =>
                      void task.run(async () => {
                        const res = await fetch(`/api/screenshot/${l.id}`);
                        if (!res.ok)
                          throw new Error(
                            "Screenshot non disponibile; usa l’analisi HTML",
                          );
                        if (screenshot) URL.revokeObjectURL(screenshot);
                        setScreenshot(URL.createObjectURL(await res.blob()));
                      })
                    }
                  >
                    <Camera size={16} /> Carica screenshot
                  </button>
                  {screenshot && (
                    <Image
                      unoptimized
                      width={1280}
                      height={900}
                      className="website-shot"
                      src={screenshot}
                      alt="Screenshot del sito da verificare visivamente"
                    />
                  )}
                </>
              )}
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel">
            <h2>Presenza online</h2>
            <UrlRow
              label="Sito"
              url={l.website_url}
              detail={l.website_status}
              demo={l.is_demo}
            />
            <div className="presence-row">
              <span>Qualità</span>
              <strong>{labels[l.website_quality]}</strong>
            </div>
            <UrlRow label="Facebook" url={l.facebook_url} demo={l.is_demo} />
            <UrlRow label="Instagram" url={l.instagram_url} demo={l.is_demo} />
            <UrlRow
              label="Menu"
              url={l.menu_url}
              detail={l.menu_status}
              demo={l.is_demo}
            />
            <UrlRow label="Google Maps" url={l.maps_url} demo={l.is_demo} />
            <div className="presence-row">
              <span>Telefono</span>
              <strong>{l.phone || "Non disponibile"}</strong>
            </div>
            <div className="presence-row">
              <span>WhatsApp</span>
              <strong>{labels[l.whatsapp_confidence]}</strong>
            </div>
            <div className="presence-row">
              <span>Eventi</span>
              <strong>
                {l.analysis.events_relevant
                  ? "Segnali presenti"
                  : "Non verificati"}
              </strong>
            </div>
            <div className="presence-row">
              <span>Recensioni</span>
              <strong>
                {l.rating ?? "—"} · {l.reviews_count}
              </strong>
            </div>
            {l.opening_hours.length > 0 && (
              <details>
                <summary>Orari</summary>
                {l.opening_hours.map((h) => (
                  <p key={h}>{h}</p>
                ))}
              </details>
            )}
            <p className="muted">
              {l.postal_code && `CAP ${l.postal_code} · `}
              {l.analysis.analyzed_at
                ? `Analizzato: ${new Date(l.analysis.analyzed_at).toLocaleString("it-IT")}`
                : "Non ancora analizzato"}
            </p>
            {l.sources.some((s) => s.source_type === "google_places") && (
              <p className="attribution">Dati attività: Google Maps</p>
            )}
          </section>
          <section className="panel">
            <h2>Il prossimo passo</h2>
            <Field label="Canale usato">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {["WhatsApp", "Messenger", "Instagram", "Email", "altro"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Note del contatto">
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cosa vi siete detti?"
              />
            </Field>
            <button
              className="button full"
              disabled={task.busy || blocked}
              onClick={() =>
                void task.run(async () => {
                  await saveDraft();
                  await command(
                    "patch",
                    { status: "contacted", channel, event_notes: notes },
                    l.id,
                  );
                  setStatus("contacted");
                  setNotes("");
                  notify("Contatto registrato");
                })
              }
            >
              <Check size={16} /> Segna contattato
            </button>
            <div className="separator" />
            <Field label="Aggiorna stato">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Lead["status"])}
              >
                {statuses.map((s) => (
                  <option value={s} key={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="button secondary full"
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  await command(
                    "patch",
                    { status, event_notes: notes, channel },
                    l.id,
                  );
                  notify("Stato aggiornato");
                })
              }
            >
              Salva stato
            </button>
            <div className="button-row">
              <button
                className="text-button"
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await command("patch", { status: "bad_lead" }, l.id);
                    setStatus("bad_lead");
                  })
                }
              >
                Scarta
              </button>
              <button
                className="text-button danger-text"
                disabled={task.busy || l.do_not_contact}
                onClick={() =>
                  void task.run(async () => {
                    await command("patch", { do_not_contact: true }, l.id);
                    setStatus("archived");
                    notify("Lead escluso dalle ricerche future");
                  })
                }
              >
                Non mostrare più
              </button>
            </div>
            {l.notes && (
              <div className="note">
                <strong>Note attività</strong>
                <p className="pre-wrap">{l.notes}</p>
              </div>
            )}
          </section>
          <section className="panel">
            <details>
              <summary>Verifica manuale</summary>
              <p className="muted">
                Conferma solo informazioni realmente pubblicate dall’attività.
                Conserva il link e ciò che hai osservato.
              </p>
              <Field label="WhatsApp">
                <select
                  value={wa}
                  onChange={(e) =>
                    setWa(e.target.value as Lead["whatsapp_confidence"])
                  }
                >
                  {[
                    "not_available",
                    "uncertain",
                    "likely_business",
                    "confirmed_business",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Presenza sito">
                <select
                  value={site}
                  onChange={(e) =>
                    setSite(e.target.value as Lead["website_status"])
                  }
                >
                  {[
                    "unknown",
                    "none",
                    "social_only",
                    "external_page_only",
                    "own_website",
                    "broken",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="URL della fonte">
                <input
                  type="url"
                  value={verifyUrl}
                  onChange={(e) => setVerifyUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Evidenza osservata">
                <textarea
                  rows={3}
                  value={verifyNote}
                  onChange={(e) => setVerifyNote(e.target.value)}
                />
              </Field>
              <button
                className="button secondary full"
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await command(
                      "patch",
                      {
                        whatsapp_confidence: wa,
                        website_status: site,
                        verification_url: verifyUrl,
                        verification_note: verifyNote,
                      },
                      l.id,
                    );
                    notify("Verifica salvata con la fonte");
                  })
                }
              >
                Salva verifica
              </button>
            </details>
          </section>
          <section className="panel">
            <h2>Cronologia</h2>
            <div className="timeline">
              {[...l.events].reverse().map((e) => (
                <div key={e.id}>
                  <span className="timeline-dot" />
                  <strong>{statusLabels[e.event_type] || e.event_type}</strong>
                  <small>
                    {new Date(e.created_at).toLocaleString("it-IT")}
                    {e.channel && ` · ${e.channel}`}
                  </small>
                  <p>{e.notes}</p>
                </div>
              ))}
              {!l.events.length && (
                <p className="muted">Il primo passo lo scegli tu.</p>
              )}
            </div>
            {l.messages.length > 0 && (
              <details>
                <summary>Bozze precedenti ({l.messages.length})</summary>
                {[...l.messages].reverse().map((m) => (
                  <div className="historic-message" key={m.id}>
                    <small>
                      {new Date(m.created_at).toLocaleString("it-IT")} ·{" "}
                      {m.model}
                    </small>
                    <p>{m.text}</p>
                  </div>
                ))}
              </details>
            )}
          </section>
        </aside>
      </div>
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="icon-btn modal-close"
              onClick={() => setConfirm(false)}
              aria-label="Chiudi conferma"
            >
              <X size={20} />
            </button>
            <MessageCircle size={30} />
            <h2 id="wa-title">Controlla il messaggio prima di inviarlo.</h2>
            <p>
              Si aprirà WhatsApp con questa bozza. L’invio richiede una tua
              azione.
            </p>
            <div className="message-preview">{text}</div>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                Torna alla bozza
              </button>
              <a
                className="button"
                href={
                  l.whatsapp_confidence === "uncertain"
                    ? whatsappCheckUrl(l, text)
                    : whatsappUrl(l, text)
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setConfirm(false);
                  void task.run(saveDraft);
                }}
              >
                Apri WhatsApp <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
