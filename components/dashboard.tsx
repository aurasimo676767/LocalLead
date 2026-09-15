"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Users,
  Flame,
  Send,
  Clock3,
  MessageCircle,
  CircleMinus,
  ScanSearch,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { PageHeading, LeadCard, LeadTable } from "./ui";
import { contactable, contacted } from "@/lib/model";
import { isLandlinePhone } from "@/lib/utils";
export function Dashboard() {
  const { leads } = useWorkspace();
  const available = leads.filter(
    (l) => !isLandlinePhone(l.phone) && contactable(l) && !contacted(l),
  );
  const best = [...available]
    .sort((a, b) => b.lead_score - a.lead_score)
    .slice(0, 3);
  const metrics = [
    {
      label: "Lead totali",
      value: leads.length,
      icon: Users,
      hint: "La tua rete, in crescita",
    },
    {
      label: "Hot lead",
      value: available.filter((l) => l.lead_score >= 80).length,
      icon: Flame,
      hint: "Score da 80 in su",
    },
    {
      label: "Da contattare",
      value: available.filter((l) => l.lead_score >= 60).length,
      icon: Clock3,
      hint: "Un buon motivo per scrivere",
    },
    {
      label: "Contattati",
      value: leads.filter(contacted).length,
      icon: Send,
      hint: "Conversazioni iniziate",
    },
    {
      label: "Risposte positive",
      value: leads.filter((l) => l.status === "replied_positive").length,
      icon: MessageCircle,
      hint: "Il prossimo passo",
    },
    {
      label: "Rifiutati",
      value: leads.filter((l) =>
        ["replied_negative", "not_interested", "bad_lead"].includes(l.status),
      ).length,
      icon: CircleMinus,
      hint: "Tempo per altre opportunità",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="UNO SGUARDO AL TUO LAVORO"
        title="Le prossime connessioni."
        description="Piccole attività, buone opportunità. Trova quelle per cui puoi fare la differenza."
      >
        <Link className="button" href="/discover">
          <ScanSearch size={17} /> Trova lead <ArrowUpRight size={16} />
        </Link>
      </PageHeading>
      <div className="stats-grid">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={`stat-card ${i === 1 ? "featured" : ""}`}
          >
            <div>
              <span>{m.label}</span>
              <m.icon size={17} />
            </div>
            <strong>{m.value.toString().padStart(2, "0")}</strong>
            <small>{m.hint}</small>
          </div>
        ))}
      </div>
      <section className="section-heading">
        <div>
          <div className="title-inline">
            <span className="live-dot" />
            <h2>Lead migliori di oggi</h2>
            <span className="tag">La tua shortlist</span>
          </div>
          <p>Le opportunità disponibili con i segnali più interessanti.</p>
        </div>
        <Link href="/leads">
          Vedi tutti i lead <ArrowRight size={16} />
        </Link>
      </section>
      <div className="lead-grid">
        {best.map((l) => (
          <LeadCard key={l.id} lead={l} />
        ))}
        {!best.length && (
          <div className="empty-state">
            Il prossimo buon contatto è ancora da trovare.{" "}
            <Link href="/discover">Inizia una ricerca</Link>
          </div>
        )}
      </div>
      <section className="discovery-strip">
        <div className="strip-icon">
          <ScanSearch size={28} />
        </div>
        <div>
          <h3>C’è un’opportunità, dietro l’angolo.</h3>
          <p>Esplora una città e lascia che siano le evidenze a guidarti.</p>
        </div>
        <Link className="button secondary" href="/discover">
          Esplora una zona <ArrowUpRight size={16} />
        </Link>
      </section>
      <section className="section-heading">
        <div>
          <h2>La tua attività recente</h2>
          <p>Ritrova il punto in cui avevi lasciato ogni conversazione.</p>
        </div>
        <Link href="/contacted">
          Apri il CRM <ArrowRight size={16} />
        </Link>
      </section>
      <LeadTable
        leads={[...leads]
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .slice(0, 5)}
      />
    </>
  );
}
