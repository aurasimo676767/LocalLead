"use client";
import { useState } from "react";
import Link from "next/link";
import { ScanSearch, MapPin, ArrowRight, Check } from "lucide-react";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, Field, ErrorText, Score, Status } from "./ui";
import { categories, type Lead } from "@/lib/model";
import { fitsFilter } from "@/lib/scoring";
export function Discover() {
  const { command, config } = useWorkspace();
  const task = useTask();
  const [city, setCity] = useState("Vittoria, RG");
  const [selected, setSelected] = useState<Lead["category"][]>([
    "Pizzeria",
    "Bar",
    "Panineria",
    "Pasticceria",
  ]);
  const [limit, setLimit] = useState(30);
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState<
    { lead: Lead; duplicate: boolean }[] | null
  >(null);
  const [progress, setProgress] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  async function search() {
    await task.run(async () => {
      setWarnings([]);
      setResults(null);
      setProgress("Ricerca delle attività…");
      const r = await command("discover", {
        city,
        categories: selected,
        limit,
        filter,
      });
      const rows = r.results || [];
      setResults(rows);
      const completed = [...rows];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].duplicate) continue;
        setProgress(`Analisi ${i + 1} di ${rows.length}: ${rows[i].lead.name}`);
        try {
          const analyzed = await command("analyze", undefined, rows[i].lead.id);
          if (analyzed.lead) completed[i] = { ...rows[i], lead: analyzed.lead };
          setResults([...completed]);
        } catch (e) {
          setWarnings((w) => [
            ...w,
            `${rows[i].lead.name}: ${e instanceof Error ? e.message : "Analisi non disponibile"}`,
          ]);
        }
      }
      setProgress("Ricerca completata");
    });
  }
  const visible = results?.filter((r) => fitsFilter(r.lead, filter));
  return (
    <>
      <PageHeading
        eyebrow="PARTI DAL TERRITORIO"
        title="Il prossimo buon lead."
        description="Scegli una zona. Trova le attività con un’opportunità concreta."
      />
      <div className="discover-layout">
        <form
          className="panel discover-form"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="panel-title">
            <ScanSearch size={22} />
            <h2>Trova lead</h2>
          </div>
          <Field
            label="Città"
            hint="Specifica la provincia per una ricerca più precisa."
          >
            <div className="input-icon">
              <MapPin size={17} />
              <input
                required
                minLength={2}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Vittoria, RG"
              />
            </div>
          </Field>
          <fieldset>
            <legend>Categorie</legend>
            <div className="category-grid">
              {categories.map((c) => (
                <label
                  className={`category-option ${selected.includes(c) ? "selected" : ""}`}
                  key={c}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(c)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(c) ? s.filter((x) => x !== c) : [...s, c],
                      )
                    }
                  />
                  <span>{c}</span>
                  {selected.includes(c) && <Check size={14} />}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <Field label="Massimo risultati">
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                {[10, 20, 30, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Presenza online">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Tutti</option>
                <option value="none">Solo senza sito</option>
                <option value="weak_or_none">Senza sito o migliorabile</option>
                <option value="weak">Solo sito migliorabile</option>
              </select>
            </Field>
          </div>
          <ErrorText text={task.error} />
          <button
            className="button full"
            disabled={task.busy || !selected.length}
          >
            {task.busy ? (
              <span className="spinner" />
            ) : (
              <ScanSearch size={17} />
            )}{" "}
            {task.busy ? "Ricerca in corso…" : "Cerca lead"}
            <ArrowRight size={17} />
          </button>
          <small className="muted">
            {config.places}. L’analisi viene eseguita una volta e conservata in
            cache.
          </small>
        </form>
        <aside className="discovery-guide">
          <div className="guide-orbit">
            <ScanSearch size={38} />
          </div>
          <h2>Un nome non basta.</h2>
          <p>
            Un buon lead ha un bisogno reale, una fonte attendibile e un modo
            chiaro per parlarne.
          </p>
          <ol>
            <li>
              <b>Trova le attività</b>
              <span>Dati pubblici da provider ufficiali.</span>
            </li>
            <li>
              <b>Leggi i segnali</b>
              <span>Sito, menu, contatti e opportunità documentate.</span>
            </li>
            <li>
              <b>Scegli la conversazione</b>
              <span>Rivedi il messaggio. L’invio è sempre tuo.</span>
            </li>
          </ol>
          {config.places.startsWith("Demo") && (
            <div className="note">
              La ricerca demo mostra attività fittizie di Vittoria, anche se
              cambi città. I risultati sono limitati alle fixture disponibili.
            </div>
          )}
        </aside>
      </div>
      {(task.busy || results) && (
        <section className="panel discovery-results">
          <div className="section-heading">
            <div>
              <h2>
                {task.busy
                  ? progress
                  : `${visible?.length || 0} opportunità da rivedere`}
              </h2>
              <p>
                I duplicati mantengono stato e cronologia. I lead esclusi non
                vengono riproposti.
              </p>
            </div>
          </div>
          {visible?.map((r) => (
            <div className="discovery-row" key={r.lead.id}>
              <Score value={r.lead.lead_score} />
              <div>
                <Link href={`/leads/${r.lead.id}`}>
                  <strong>{r.lead.name}</strong>
                </Link>
                <p>{r.duplicate ? "Lead già presente" : r.lead.main_problem}</p>
              </div>
              <Status lead={r.lead} />
              <Link
                className="button secondary small"
                href={`/leads/${r.lead.id}`}
              >
                Apri lead
              </Link>
            </div>
          ))}
          {!task.busy && !visible?.length && (
            <div className="empty-state">
              Nessun risultato con questi criteri. Prova altre categorie o un
              filtro più ampio.
            </div>
          )}
          {warnings.map((w) => (
            <div className="note" key={w}>
              {w}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
