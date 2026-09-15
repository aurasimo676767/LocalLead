"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Upload, Plus } from "lucide-react";
import { useWorkspace } from "./workspace";
import { PageHeading, LeadTable, Field } from "./ui";
import { categories, statuses, statusLabels, contacted } from "@/lib/model";
import { fitsFilter } from "@/lib/scoring";
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
  const filtered = leads
    .filter(
      (l) =>
        (mode !== "contacted" || contacted(l)) &&
        (mode !== "archive" ||
          l.do_not_contact ||
          ["archived", "bad_lead", "not_interested"].includes(l.status)) &&
        (!query ||
          `${l.name} ${l.notes} ${l.address}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!city || l.city === city) &&
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
        description="Ogni attività, le sue evidenze e il prossimo passo."
      >
        <Link className="button secondary" href="/leads/import">
          <Upload size={16} /> Importa CSV
        </Link>
        <Link className="button" href="/leads/new">
          <Plus size={16} /> Nuovo lead
        </Link>
      </PageHeading>
      <div className="panel filters">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Cerca lead"
            placeholder="Cerca per nome, indirizzo o note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-grid">
          <Field label="Città">
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Tutte le città</option>
              {[...new Set(leads.map((l) => l.city))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
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
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tutti</option>
              {statuses.map((s) => (
                <option value={s} key={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Score minimo">
            <select value={score} onChange={(e) => setScore(e.target.value)}>
              {[0, 40, 60, 80].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Tutti" : `${n}+`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sito">
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="all">Tutti</option>
              <option value="none">Senza sito</option>
              <option value="weak">Sito migliorabile</option>
              <option value="weak_or_none">Senza sito o migliorabile</option>
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
          <Field label="Ordina per">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="score">Score più alto</option>
              <option value="reviews">Recensioni</option>
              <option value="recent">Più recenti</option>
              <option value="name">Nome</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="result-count">{filtered.length} lead trovati</div>
      <LeadTable leads={filtered} />
    </>
  );
}
