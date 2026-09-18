"use client";
import { useState } from "react";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, Field, ErrorText } from "./ui";
import { type Preferences } from "@/lib/model";
import { Download, Check } from "lucide-react";
export function Settings() {
  const { config, preferences, command, notify, leads } = useWorkspace();
  const [prefs, setPrefs] = useState(preferences);
  const task = useTask();
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
              onChange={(e) => setPrefs({ ...prefs, sender_name: e.target.value })}
            />
          </Field>
          <Field label="Dove abiti">
            <input
              value={prefs.sender_city}
              maxLength={60}
              placeholder="es. Vittoria"
              onChange={(e) => setPrefs({ ...prefs, sender_city: e.target.value })}
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
                "“Abito a …” e “siti per locali della zona”.",
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
        </div>
      </div>
    </>
  );
}
