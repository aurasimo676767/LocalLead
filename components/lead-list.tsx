"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Upload,
  Plus,
  ScanSearch,
  Trash2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useWorkspace, useTask } from "./workspace";
import { useOverlay } from "./use-overlay";
import { PageHeading, LeadTable, Field, ErrorText } from "./ui";
import {
  categories,
  statuses,
  statusLabels,
  contacted,
  deletable,
  type Lead,
} from "@/lib/model";
import { isLandlinePhone } from "@/lib/utils";
import { fitsFilter } from "@/lib/scoring";
const cityKey = (city: string) => city.trim().toLocaleLowerCase("it");
export function LeadList({
  mode = "all",
}: {
  mode?: "all" | "contacted" | "archive";
}) {
  const { leads } = useWorkspace();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [score, setScore] = useState("0");
  const [site, setSite] = useState("all");
  const [channel, setChannel] = useState("");
  const [contact, setContact] = useState("");
  const [sort, setSort] = useState("score");
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState<Lead[] | null>(null);
  // What belongs on this page, before any filter the user picks.
  const inMode = leads.filter(
    (l) =>
      !isLandlinePhone(l.phone) &&
      (mode !== "all" ||
        ((!contacted(l) || contact === "yes") &&
          !l.do_not_contact &&
          ![
            "archived",
            "bad_lead",
            "not_interested",
            "replied_negative",
          ].includes(l.status))) &&
      (mode !== "contacted" || contacted(l)) &&
      (mode !== "archive" ||
        l.do_not_contact ||
        ["archived", "bad_lead", "not_interested"].includes(l.status)),
  );
  const cities = [
    ...inMode
      .reduce((map, l) => {
        const key = cityKey(l.city);
        const entry = map.get(key) || { name: l.city.trim(), count: 0 };
        entry.count++;
        return map.set(key, entry);
      }, new Map<string, { name: string; count: number }>())
      .entries(),
  ].sort((a, b) => b[1].count - a[1].count);
  const activeCity = cities.find(([key]) => key === city)?.[1];
  const inCity = inMode.filter((l) => !city || cityKey(l.city) === city);
  const filtered = inCity
    .filter(
      (l) =>
        (!query ||
          `${l.name} ${l.notes} ${l.address}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!category || l.category === category) &&
        (!status || l.status === status) &&
        l.lead_score >= Number(score) &&
        fitsFilter(l, site) &&
        (!channel ||
          (channel === "whatsapp"
            ? ["confirmed_business", "likely_business"].includes(
                l.whatsapp_confidence,
              )
            : channel === "facebook"
              ? !!l.facebook_url
              : l.menu_status === "external_platform")) &&
        (!contact || (contact === "yes" ? contacted(l) : !contacted(l))),
    )
    .sort((a, b) =>
      sort === "score"
        ? b.lead_score - a.lead_score
        : sort === "reviews"
          ? b.reviews_count - a.reviews_count
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : b.created_at.localeCompare(a.created_at),
    );
  const removable = inCity.filter(deletable);
  const withoutSite = inCity.filter((l) => fitsFilter(l, "none")).length;
  const extraFilters =
    [category, status, channel, contact].filter(Boolean).length +
    (score !== "0" ? 1 : 0);
  return (
    <>
      <PageHeading
        title={
          mode === "contacted"
            ? "Conversazioni iniziate."
            : mode === "archive"
              ? "Il tuo archivio."
              : "Tutti i tuoi lead."
        }
        description={
          mode === "all"
            ? "I locali trovati, divisi per città."
            : "Ogni attività, le sue evidenze e il prossimo passo."
        }
      >
        {mode === "all" && (
          <>
            <Link className="button secondary" href="/leads/import">
              <Upload size={16} /> Importa CSV
            </Link>
            <Link className="button" href="/leads/new">
              <Plus size={16} /> Nuovo lead
            </Link>
          </>
        )}
      </PageHeading>
      {cities.length > 0 && (
        <nav className="city-tabs" aria-label="Città">
          <button
            className={!city ? "active" : ""}
            aria-pressed={!city}
            onClick={() => setCity("")}
          >
            Tutte <span>{inMode.length}</span>
          </button>
          {cities.map(([key, entry]) => (
            <button
              key={key}
              className={city === key ? "active" : ""}
              aria-pressed={city === key}
              onClick={() => setCity(key)}
            >
              {entry.name} <span>{entry.count}</span>
            </button>
          ))}
        </nav>
      )}
      {mode === "all" && inCity.length > 0 && (
        <section className="city-summary">
          <div>
            <h2>{activeCity ? activeCity.name : "Tutte le città"}</h2>
            <p>
              {inCity.length} {inCity.length === 1 ? "locale" : "locali"} da
              lavorare, {withoutSite} senza sito
            </p>
          </div>
          <div className="city-actions">
            <Link
              className="button"
              href={
                activeCity
                  ? `/discover?city=${encodeURIComponent(activeCity.name)}`
                  : "/discover"
              }
            >
              <ScanSearch size={16} />
              {activeCity
                ? `Trova altri locali a ${activeCity.name}`
                : "Trova altri locali"}
            </Link>
            {removable.length > 0 && (
              <button
                className="button secondary danger"
                onClick={() => setConfirm(removable)}
              >
                <Trash2 size={16} />
                {activeCity
                  ? `Cancella lead di ${activeCity.name}`
                  : "Cancella tutti"}
              </button>
            )}
          </div>
        </section>
      )}
      {inMode.length > 0 && (
        <div className="panel filters">
          <div className="filter-bar">
            <div className="search-input">
              <Search size={18} />
              <input
                aria-label="Cerca lead"
                placeholder="Cerca per nome, indirizzo o note…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Sito"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              <option value="all">Tutti i siti</option>
              <option value="none">Senza sito</option>
              <option value="weak">Sito migliorabile</option>
              <option value="weak_or_none">Senza sito o migliorabile</option>
            </select>
            <select
              aria-label="Ordina per"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="score">Score più alto</option>
              <option value="recent">Più recenti</option>
              <option value="reviews">Recensioni</option>
              <option value="name">Nome</option>
            </select>
            <button
              className={`button secondary ${more ? "on" : ""}`}
              aria-expanded={more}
              onClick={() => setMore(!more)}
            >
              <SlidersHorizontal size={16} /> Filtri
              {extraFilters > 0 && (
                <span className="filter-count">{extraFilters}</span>
              )}
            </button>
          </div>
          {more && (
            <div className="filter-grid">
              <Field label="Categoria">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Tutte</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Stato">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Tutti</option>
                  {statuses.map((s) => (
                    <option value={s} key={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Score minimo">
                <select
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                >
                  {[0, 40, 60, 80].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Tutti" : `${n}+`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Canali / menu">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="">Tutti</option>
                  <option value="whatsapp">Con WhatsApp</option>
                  <option value="facebook">Con Facebook</option>
                  <option value="menu">Menu esterno</option>
                </select>
              </Field>
              {mode !== "contacted" && (
                <Field label="Contatto">
                  <select
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  >
                    <option value="">Tutti</option>
                    <option value="yes">Già contattati</option>
                    <option value="no">Mai contattati</option>
                  </select>
                </Field>
              )}
            </div>
          )}
        </div>
      )}
      {inMode.length > 0 && (
        <div className="result-count">{filtered.length} lead in lista</div>
      )}
      {!inMode.length && mode === "all" ? (
        <div className="panel empty-state">
          Nessun locale da lavorare.
          <Link className="button" href="/discover">
            <ScanSearch size={16} /> Trova locali nuovi
          </Link>
        </div>
      ) : (
        <LeadTable leads={filtered} />
      )}
      {confirm && (
        <DeleteDialog
          leads={confirm}
          city={activeCity?.name || ""}
          onClose={() => setConfirm(null)}
          onDone={() => {
            setConfirm(null);
            setCity("");
          }}
        />
      )}
    </>
  );
}
function DeleteDialog({
  leads,
  city,
  onClose,
  onDone,
}: {
  leads: Lead[];
  city: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { command, notify } = useWorkspace();
  const task = useTask();
  const [remember, setRemember] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (!task.busy) onClose();
  }, [task.busy, onClose]);
  useOverlay(true, dialog, close);
  const count = leads.length;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          data-overlay-close
          className="icon-btn modal-close"
          onClick={close}
          aria-label="Chiudi"
        >
          <X size={20} />
        </button>
        <Trash2 size={30} className="danger-icon" />
        <h2 id="delete-title">
          {city
            ? `Cancellare ${count} lead di ${city}?`
            : `Cancellare ${count} lead?`}
        </h2>
        <p>
          Spariscono dalla lista insieme a note e bozze. I lead già contattati e
          quelli da non contattare restano dove sono.
        </p>
        <label className="toggle-row">
          <span>
            <strong>Non riproporli nelle prossime ricerche</strong>
            <small>
              Se lo spegni, una nuova ricerca può ritrovarli come nuovi.
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
        </label>
        <ErrorText text={task.error} />
        <div className="button-row">
          <button className="button secondary" onClick={close}>
            Annulla
          </button>
          <button
            className="button danger-solid"
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                const ids = leads.map((l) => l.id);
                let deleted = 0;
                // Chunks keep each request well under the API size limit.
                for (let i = 0; i < ids.length; i += 500) {
                  const result = await command("delete", {
                    ids: ids.slice(i, i + 500),
                    remember,
                  });
                  deleted += result.deleted?.length || 0;
                }
                notify(
                  deleted === 1
                    ? "1 lead cancellato"
                    : `${deleted} lead cancellati`,
                );
                onDone();
              })
            }
          >
            {task.busy ? <span className="spinner" /> : <Trash2 size={16} />}
            Cancella {count} lead
          </button>
        </div>
      </div>
    </div>
  );
}
