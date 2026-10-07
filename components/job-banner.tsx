"use client";
import Link from "next/link";
import { X } from "lucide-react";
import { useJobs } from "./jobs";

/** What the background job is doing, on every page, with a way back to it. */
export function JobBanner() {
  const { jobs, dismiss } = useJobs();
  const job =
    jobs.find((j) => j.state === "running") ||
    jobs.find((j) => j.state === "queued") ||
    [...jobs].reverse().find((j) => j.state === "done");
  if (!job) return null;
  const queued = jobs.filter((j) => j.state === "queued").length;
  const href =
    job.kind === "search"
      ? job.sector === "alloggi"
        ? "/alloggi/cerca"
        : "/discover"
      : job.sector === "alloggi"
        ? "/alloggi"
        : "/leads";
  const what = job.kind === "search" ? `Ricerca ${job.label}` : job.label;
  const done = job.state === "done";
  const count = job.leadIds.length;
  return (
    <div className={`job-banner${done ? " done" : ""}`} role="status">
      {!done && <span className="spinner" />}
      <Link href={href}>
        <strong>{what}</strong>{" "}
        {job.state === "queued"
          ? "in coda"
          : done
            ? job.error
              ? `interrotta: ${job.error}`
              : `finita: ${count - job.failures.length} di ${count} pronti${job.failures.length ? `, ${job.failures.length} saltati` : ""}`
            : count
              ? `${Math.min(job.finished.length + 1, count)} di ${count} · ${job.current}`
              : job.current}
        {queued > 0 && !done && ` · altri ${queued} in coda`}
      </Link>
      {!done && (
        <small>Non chiudere né ricaricare la scheda finché non finisce.</small>
      )}
      {done && (
        <button
          className="icon-btn"
          aria-label="Chiudi avviso"
          onClick={() => dismiss(job.id)}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
