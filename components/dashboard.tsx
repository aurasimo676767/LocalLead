"use client";
import Link from "next/link";
import { ArrowRight, ScanSearch } from "lucide-react";
import { useWorkspace } from "./workspace";
import { PageHeading, LeadRow, LeadTable } from "./ui";
import { contactable, contacted } from "@/lib/model";
import { isLandlinePhone } from "@/lib/utils";
export function Dashboard() {
  const { leads } = useWorkspace();
  const available = leads.filter(
    (l) => !isLandlinePhone(l.phone) && contactable(l) && !contacted(l),
  );
  const best = [...available]
    .sort((a, b) => b.lead_score - a.lead_score)
    .slice(0, 5);
  const metrics = [
    { label: "Lead totali", value: leads.length },
    {
      label: "Hot lead",
      value: available.filter((l) => l.lead_score >= 80).length,
      hot: true,
    },
    {
      label: "Da contattare",
      value: available.filter((l) => l.lead_score >= 60).length,
    },
    { label: "Contattati", value: leads.filter(contacted).length },
    {
      label: "Risposte positive",
      value: leads.filter((l) => l.status === "replied_positive").length,
    },
    {
      label: "Rifiutati",
      value: leads.filter((l) =>
        ["replied_negative", "not_interested", "bad_lead"].includes(l.status),
      ).length,
    },
  ];
  return (
    <>
      <PageHeading
        title="Le prossime connessioni."
        description="Chi contattare adesso e a che punto sei con gli altri."
      >
        <Link className="button" href="/discover">
          <ScanSearch size={17} /> Trova lead
        </Link>
      </PageHeading>
      <dl className="stats-strip">
        {metrics.map((m) => (
          <div key={m.label} className={m.hot ? "hot" : undefined}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>
      <section className="section-heading">
        <div>
          <h2>Da contattare adesso</h2>
          <p>I lead non ancora contattati con il punteggio più alto.</p>
        </div>
        <Link href="/leads">
          Tutti i lead <ArrowRight size={16} />
        </Link>
      </section>
      <div className="lead-rows">
        {best.map((l) => (
          <LeadRow key={l.id} lead={l} />
        ))}
        {!best.length && (
          <div className="empty-state">
            Nessun lead da contattare.{" "}
            <Link href="/discover">Cerca locali in una città</Link>
          </div>
        )}
      </div>
      <section className="section-heading">
        <div>
          <h2>Attività recente</h2>
          <p>Gli ultimi lead che hai aggiornato.</p>
        </div>
        <Link href="/contacted">
          Contattati <ArrowRight size={16} />
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
