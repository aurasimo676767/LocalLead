"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScanSearch, MapPin, ArrowRight, Check } from "lucide-react";
import { useWorkspace } from "./workspace";
import { useJobs } from "./jobs";
import { saveScanBatch } from "./scan-batch";
import { PageHeading, Field, Score, Status } from "./ui";
import { type Lead } from "@/lib/model";
import { inSector, sectorCategories, type Sector } from "@/lib/sector";
import { fitsFilter } from "@/lib/scoring";
export function Discover({ sector = "locali" }: { sector?: Sector }) {
  const { config, leads, preferences } = useWorkspace();
  const lodging = sector === "alloggi";
  const noun = lodging ? "alloggi" : "locali";
  const options = sectorCategories(sector);
  const jobs = useJobs();
  const params = useSearchParams();
  const [city, setCity] = useState(
    () => params.get("city") || preferences.sender_city || "Vittoria",
  );
  // Cities already in the workspace: a new search there only adds new places.
  const searched = [
    ...leads
      .filter(inSector(sector))
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
  const [selected, setSelected] = useState<Lead["category"][]>(
    lodging
      ? ["B&B", "Casa vacanza"]
      : ["Pizzeria", "Bar", "Panineria", "Pasticceria"],
  );
  const [limit, setLimit] = useState(30);
  const [filter, setFilter] = useState("all");
  // The search runs in the background job runner: it survives leaving this page.
  const job = jobs.lastSearch(sector);
  const working = !!job && job.state !== "done";
  const skipped = job?.skipped || 0;
  const progress = job
    ? job.state === "queued"
      ? "In coda…"
      : job.state === "running"
        ? job.leadIds.length
          ? `Locale ${Math.min(job.finished.length + 1, job.leadIds.length)} di ${job.leadIds.length}: ${job.current}`
          : job.current || "Ricerca delle attività…"
        : "Ricerca completata"
    : "";
  const warnings = [
    ...(job?.error ? [job.error] : []),
    ...(job?.failures || []).map((f) => `${f.id}: ${f.error}`),
  ];
  const results = job
    ? job.leadIds
        .map((id) => leads.find((l) => l.id === id))
        .filter((l): l is Lead => !!l)
        .map((lead) => ({
          lead,
          waiting: working && !job.finished.includes(lead.id),
        }))
    : null;
  function search() {
    jobs.startSearch({ city, categories: selected, limit, filter }, sector);
  }
  const visible = results?.filter((r) =>
    fitsFilter(r.lead, job?.input?.filter || "all"),
  );
  // Opening a result pins the arrows on the lead page to this search only.
  const openFromScan = () =>
    saveScanBatch(visible?.map((r) => r.lead.id) || []);
  return (
    <>
      <PageHeading
        title={lodging ? "La prossima struttura." : "Il prossimo buon lead."}
        description={
          lodging
            ? "Scegli una zona. Trova B&B e case vacanza senza un sito tutto loro."
            : "Scegli una zona. Trova le attività con un’opportunità concreta."
        }
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
            hint={`${lodging ? "Gli alloggi" : "I locali"} che hai già trovato qui vengono saltati: la ricerca aggiunge solo quelli nuovi.`}
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
              {options.map((c) => (
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
          <button
            className="button full"
            disabled={working || !selected.length}
          >
            {working ? <span className="spinner" /> : <ScanSearch size={17} />}{" "}
            {working ? "Ricerca in corso…" : `Cerca ${noun} nuovi`}
            <ArrowRight size={17} />
          </button>
          {working ? (
            <div className="note">
              La ricerca continua anche se cambi pagina o apri un lead: non
              chiudere né ricaricare la scheda finché non finisce.
            </div>
          ) : (
            <small className="muted">
              {config.places}. L’analisi viene eseguita una volta e conservata
              in cache.
            </small>
          )}
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
      {(working || results) && (
        <section className="panel discovery-results">
          <div className="section-heading">
            <div>
              <h2>
                {working
                  ? progress
                  : visible?.length === 1
                    ? lodging
                      ? "1 alloggio nuovo"
                      : "1 locale nuovo"
                    : `${visible?.length || 0} ${noun} nuovi`}
              </h2>
              <p>
                {skipped > 0
                  ? `${skipped} già trovati o cancellati prima sono stati saltati.`
                  : "Tutti i risultati sono locali che non avevi ancora."}
                {job?.discarded
                  ? ` ${job.discarded} scartati perché non c'era niente da proporre: non li ritroverai nelle prossime ricerche.`
                  : ""}
              </p>
            </div>
          </div>
          {visible?.map((r) => (
            <div className="discovery-row" key={r.lead.id}>
              <Score value={r.lead.lead_score} />
              <div>
                <Link
                  href={`/leads/${r.lead.id}?scan=1`}
                  onClick={openFromScan}
                >
                  <strong>{r.lead.name}</strong>
                </Link>
                <p>{r.lead.main_problem}</p>
                <small className="muted">
                  {r.waiting
                    ? "In attesa di analisi e bozza"
                    : r.lead.messages.length
                      ? "Bozza pronta"
                      : "Nessun motivo per una bozza"}
                  {r.lead.preview && (
                    <>
                      {" · "}
                      <a
                        href={`/s/${r.lead.preview.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Anteprima
                      </a>
                    </>
                  )}
                </small>
              </div>
              <Status lead={r.lead} />
              <Link
                className="button secondary small"
                href={`/leads/${r.lead.id}?scan=1`}
                onClick={openFromScan}
              >
                Apri lead
              </Link>
            </div>
          ))}
          {!working && !visible?.length && (
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
