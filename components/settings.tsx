"use client";
import { useState } from "react";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, Field, ErrorText } from "./ui";
import { type Preferences } from "@/lib/model";
import { LOCAL_KM } from "@/lib/messaging";
import { Download, Check, Trash2 } from "lucide-react";
export function Settings() {
  const { config, preferences, command, notify, leads } = useWorkspace();
  const [prefs, setPrefs] = useState(preferences);
  const task = useTask();
  const wipe = useTask();
  const [confirmWipe, setConfirmWipe] = useState("");
  const wipeable = leads.filter((l) => !l.do_not_contact).length;
  return (
    <>
      <PageHeading
        title="Il tuo modo di lavorare."
        description="Scegli la voce dei tuoi messaggi e controlla i servizi collegati."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Preferenze messaggi</h2>
          <Field label="Il tuo nome">
            <input
              value={prefs.sender_name}
              maxLength={40}
              placeholder="Solo il nome, es. Simone"
              onChange={(e) =>
                setPrefs({ ...prefs, sender_name: e.target.value })
              }
            />
          </Field>
          <Field
            label="Dove abiti"
            hint={
              preferences.sender_lat !== null &&
              preferences.sender_place === prefs.sender_city.trim()
                ? `Trovata: ${preferences.sender_label || prefs.sender_city}. «Della zona» solo per i locali entro ${LOCAL_KM} km. Se la città è sbagliata aggiungi la provincia, es. «Vittoria RG».`
                : "Salva per trovare la posizione. Senza posizione «della zona» vale solo per i locali della tua città."
            }
          >
            <input
              value={prefs.sender_city}
              maxLength={60}
              placeholder="es. Vittoria"
              onChange={(e) =>
                setPrefs({ ...prefs, sender_city: e.target.value })
              }
            />
          </Field>
          <Field label="Tono">
            <select
              value={prefs.tone}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  tone: e.target.value as Preferences["tone"],
                })
              }
            >
              <option>molto casual</option>
              <option>casual</option>
              <option>neutro</option>
            </select>
          </Field>
          <Field
            label="Il tuo numero WhatsApp"
            hint="Per il pulsante «Mi interessa» delle anteprime: il locale ti scrive con un tocco. Senza numero il pulsante non compare."
          >
            <input
              value={prefs.sender_phone}
              maxLength={40}
              inputMode="tel"
              placeholder="es. 333 123 4567"
              onChange={(e) =>
                setPrefs({ ...prefs, sender_phone: e.target.value })
              }
            />
          </Field>
          <Field
            label="Prezzo del sito (€)"
            hint="Compare sull'anteprima: «il sito completo a … €, una volta sola»."
          >
            <input
              type="number"
              min={0}
              max={10000}
              step={10}
              value={prefs.site_price}
              onChange={(e) =>
                // An emptied field keeps the last price: prospects never see "0 €".
                setPrefs({
                  ...prefs,
                  site_price: Math.max(
                    1,
                    Math.min(
                      10000,
                      Math.round(Number(e.target.value) || prefs.site_price),
                    ),
                  ),
                })
              }
            />
          </Field>
          {(
            [
              [
                "qr",
                "Proponi QR code quando rilevanti",
                "Un’idea per menu digitali, mai un obbligo.",
              ],
              [
                "events",
                "Menziona eventi verificati",
                "Solo quando sono presenti segnali reali.",
              ],
              [
                "restyling",
                "Parla di restyling per siti esistenti",
                "Se disattivato, la proposta parla di miglioramento.",
              ],
              [
                "local",
                "Di’ che abiti in zona",
                `“Abito a …” e “siti per locali della zona”, solo per i locali entro ${LOCAL_KM} km da te.`,
              ],
              [
                "free_demo",
                "Consenti una demo gratuita",
                "Disattivato per default. Abilitalo solo se vuoi offrirla.",
              ],
            ] as const
          ).map(([key, title, hint]) => (
            <label className="toggle-row" key={key}>
              <span>
                <strong>{title}</strong>
                <small>{hint}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs[key]}
                onChange={(e) =>
                  setPrefs({ ...prefs, [key]: e.target.checked })
                }
              />
            </label>
          ))}
          <ErrorText text={task.error} />
          <button
            className="button"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await command("settings", prefs);
                notify("Preferenze salvate");
              })
            }
          >
            <Check size={16} /> Salva preferenze
          </button>
        </section>
        <div>
          <section className="panel">
            <h2>Servizi e modalità</h2>
            {[
              [
                "Modalità",
                config.demo
                  ? "Demo · salvataggio nel browser"
                  : "Live · Supabase",
              ],
              ["Ricerca locali", config.places],
              ["Enrichment", config.search],
              [
                "Analisi AI",
                config.ai ? config.model : "Bozze locali (senza API)",
              ],
              ["Modello configurato", config.model],
              ["Screenshot", config.screenshot],
            ].map(([label, value]) => (
              <div className="presence-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <p className="muted">
              I provider si configurano nelle variabili d’ambiente del server.
              Le chiavi non vengono salvate nel browser.
            </p>
          </section>
          <section className="panel">
            <h2>Una copia del tuo lavoro</h2>
            <p className="muted">
              Esporta lead, fonti, messaggi, preferenze e cronologia in JSON.
              Utile anche come backup dei dati demo.
            </p>
            <button
              className="button secondary"
              onClick={() => {
                const blob = new Blob(
                  [JSON.stringify({ version: 1, leads, preferences }, null, 2)],
                  { type: "application/json" },
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `locallead-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={16} /> Esporta backup
            </button>
          </section>
          <section className="panel">
            <h2>Ricomincia da zero</h2>
            <p className="muted">
              Cancella {wipeable} lead, locali e alloggi, anche quelli già
              contattati, con bozze, anteprime e cronologia. Le ricerche future
              non li ripescheranno. Restano solo i {leads.length - wipeable}{" "}
              segnati «non contattare». Esporta prima un backup se ti serve.
            </p>
            <Field label="Scrivi CANCELLA per confermare">
              <input
                value={confirmWipe}
                onChange={(e) => setConfirmWipe(e.target.value)}
                placeholder="CANCELLA"
              />
            </Field>
            <button
              className="button danger-solid"
              disabled={confirmWipe !== "CANCELLA" || wipe.busy || !wipeable}
              onClick={() =>
                void wipe.run(async () => {
                  const result = await command("delete_all", "CANCELLA");
                  setConfirmWipe("");
                  notify(
                    `${result.deleted?.length || 0} lead cancellati: le prossime ricerche non li ripescano`,
                  );
                })
              }
            >
              {wipe.busy ? <span className="spinner" /> : <Trash2 size={16} />}{" "}
              Cancella tutti i lead
            </button>
            <ErrorText text={wipe.error} />
          </section>
        </div>
      </div>
    </>
  );
}
