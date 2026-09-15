"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  MapPin,
  Globe,
  MessageCircle,
  MessageSquare as Facebook,
  ChevronRight,
} from "lucide-react";
import { type Lead, statusLabels } from "@/lib/model";
import { hotReasons } from "@/lib/scoring";
export function Score({
  value,
  large = false,
}: {
  value: number;
  large?: boolean;
}) {
  return (
    <span
      className={`score ${large ? "large" : ""} ${value >= 80 ? "hot" : value >= 60 ? "warm" : value >= 40 ? "neutral" : "low"}`}
    >
      {value}
      <small>/100</small>
    </span>
  );
}
export function Status({ lead }: { lead: Lead }) {
  return (
    <span className={`status status-${lead.status}`}>
      {lead.do_not_contact ? "Non contattare" : statusLabels[lead.status]}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function LeadCard({ lead }: { lead: Lead }) {
  return (
    <article className="lead-card">
      <div className="card-top">
        <span className="category-icon">
          {lead.category === "Pizzeria"
            ? "P"
            : lead.category === "Cocktail bar"
              ? "V"
              : lead.name[0]}
        </span>
        <Status lead={lead} />
      </div>
      <div className="card-title">
        <div>
          <Link href={`/leads/${lead.id}`}>
            <h3>{lead.name}</h3>
          </Link>
          <p>
            {lead.category} <span>·</span> {lead.city}
          </p>
        </div>
        <Score value={lead.lead_score} />
      </div>
      <div className="problem">
        <span>OPPORTUNITÀ</span>
        <p>{lead.opportunity}</p>
      </div>
      <ul className="reasons">
        {hotReasons(lead).map((r) => (
          <li key={r.label}>
            <span className="reason-dot" />
            {r.label}
          </li>
        ))}
      </ul>
      <div className="card-footer">
        <div className="channels">
          {lead.facebook_url && (
            <span title="Facebook">
              <Facebook size={15} />
            </span>
          )}
          {["confirmed_business", "likely_business"].includes(
            lead.whatsapp_confidence,
          ) && (
            <span title="WhatsApp business">
              <MessageCircle size={15} />
            </span>
          )}
          {lead.website_url && (
            <span title="Sito web">
              <Globe size={15} />
            </span>
          )}
        </div>
        <Link href={`/leads/${lead.id}`}>
          Apri lead <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}
export function LeadTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ATTIVITÀ</th>
            <th>SCORE</th>
            <th>OPPORTUNITÀ</th>
            <th>STATO</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td>
                <Link className="table-name" href={`/leads/${l.id}`}>
                  {l.name}
                </Link>
                <small>
                  <MapPin size={12} />
                  {l.city} · {l.category}
                </small>
              </td>
              <td>
                <Score value={l.lead_score} />
              </td>
              <td className="opportunity-cell">{l.main_problem}</td>
              <td>
                <Status lead={l} />
              </td>
              <td>
                <Link aria-label={`Apri ${l.name}`} href={`/leads/${l.id}`}>
                  <ChevronRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!leads.length && (
        <div className="empty-state">
          Nessun lead con questi filtri. Prova una nuova ricerca.
        </div>
      )}
    </div>
  );
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <div className="error-box" role="alert">
      {text}
    </div>
  ) : null;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
