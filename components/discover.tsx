"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScanSearch, MapPin, ArrowRight, Check } from "lucide-react";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, Field, ErrorText, Score, Status } from "./ui";
import { categories, type Lead } from "@/lib/model";
import { fitsFilter } from "@/lib/scoring";
export function Discover() {
  const { command, config, leads, preferences } = useWorkspace();
  const task = useTask();
  const params = useSearchParams();
  const [city, setCity] = useState(
    () => params.get("city") || preferences.sender_city || "Vittoria",
  );
  // Cities already in the workspace: a new search there only adds new places.
  const searched = [
    ...leads
      .reduce((map, l) => {
        const key = l.city.trim().toLocaleLowerCase("it");
        if (key)
          map.set(key, {
            name: l.city.trim(),
            count: (map.get(key)?.count || 0) + 1,
          });
        return map;
      }, new Map<string, { name: string; count: number }>())
      .values(),
  ].sort((a, b) => b.count - a.count);
  const [skipped, setSkipped] = useState(0);
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
      setSkipped(0);
      setProgress("Ricerca delle attività…");
      const r = await command("discover", {
        city,
        categories: selected,
        limit,
        filter,
      });
      const rows = (r.results || []).filter((row) => !row.duplicate);
      setSkipped(r.skipped || 0);
      setResults(rows);
      const completed = [...rows];
      for (let i = 0; i < rows.length; i++) {
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
            hint="I locali che hai già trovato qui vengono saltati: la ricerca aggiunge solo quelli nuovi."
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
          {searched.length > 0 && (
            <div className="searched-cities" aria-label="Città già cercate">
              {searched.slice(0, 8).map((c) => (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => setCity(c.name)}
                >
                  {c.name}
                  <small>{c.count} già trovati</small>
                </button>
              ))}
            </div>
          )}
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
            {task.busy ? "Ricerca in corso…" : "Cerca locali nuovi"}
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
                  : visible?.length === 1
                    ? "1 locale nuovo"
                    : `${visible?.length || 0} locali nuovi`}
              </h2>
              <p>
                {skipped > 0
                  ? `${skipped} già trovati o cancellati prima sono stati saltati.`
                  : "Tutti i risultati sono locali che non avevi ancora."}
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
                <p>{r.lead.main_problem}</p>
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
              {skipped > 0
                ? "Nessun locale nuovo: quelli trovati li avevi già. Prova altre categorie o una città vicina."
                : "Nessun risultato con questi criteri. Prova altre categorie o un filtro più ampio."}
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
