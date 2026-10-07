"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "./workspace";
import type { Lead } from "@/lib/model";
import type { Sector } from "@/lib/sector";
import { needsDraft, shouldDiscard } from "@/lib/lead-views";
import { retry, runEach, type StepFailure } from "@/lib/job-runner";

export type SearchInput = {
  city: string;
  categories: Lead["category"][];
  limit: number;
  filter: string;
};
export type Job = {
  id: string;
  kind: "search" | "drafts";
  sector: Sector;
  label: string;
  state: "queued" | "running" | "done";
  // Leads of this job, in order: found by the search or picked for drafts.
  leadIds: string[];
  // Ids already processed, so the page can show what is still waiting.
  finished: string[];
  current: string;
  skipped: number;
  // Analysed and dropped: no reason to write to them.
  discarded: number;
  failures: StepFailure[];
  error: string;
  input?: SearchInput;
  draftIds?: string[];
};
type Context = {
  jobs: Job[];
  active?: Job;
  startSearch: (input: SearchInput, sector: Sector) => void;
  startDrafts: (ids: string[], label: string, sector: Sector) => void;
  lastSearch: (sector: Sector) => Job | undefined;
  dismiss: (id: string) => void;
};
const JobsContext = createContext<Context | null>(null);

/**
 * Searches and draft batches run here, above the pages, one at a time: moving
 * between pages or going back never stops them, and two jobs never write the
 * same lead at once. Only closing or reloading the tab does, and the browser
 * asks first.
 */
export function JobsProvider({ children }: { children: React.ReactNode }) {
  const { command, leads, preferences } = useWorkspace();
  const [jobs, setJobs] = useState<Job[]>([]);
  const running = useRef(false);
  // The runner reads the latest data, not the values of the render that started it.
  const live = useRef({ command, leads, preferences });
  useEffect(() => {
    live.current = { command, leads, preferences };
  });
  const update = useCallback(
    (id: string, patch: (job: Job) => Partial<Job>) =>
      setJobs((all) =>
        all.map((j) => (j.id === id ? { ...j, ...patch(j) } : j)),
      ),
    [],
  );
  const name = (id: string) =>
    live.current.leads.find((l) => l.id === id)?.name || "un locale";
  const draft = useCallback(async (id: string, lead?: Lead) => {
    const fresh = lead || live.current.leads.find((l) => l.id === id);
    if (!fresh || !needsDraft(fresh, live.current.preferences)) return;
    await retry(() => live.current.command("message", undefined, id));
  }, []);
  const run = useCallback(
    async (job: Job) => {
      update(job.id, () => ({ state: "running" }));
      try {
        let ids = job.draftIds || [];
        if (job.kind === "search" && job.input) {
          update(job.id, () => ({ current: "Ricerca delle attività…" }));
          const found = await retry(() =>
            live.current.command("discover", job.input),
          );
          ids = (found.results || [])
            .filter((row) => !row.duplicate)
            .map((row) => row.lead.id);
          update(job.id, () => ({ leadIds: ids, skipped: found.skipped || 0 }));
        }
        const failures = await runEach(
          ids,
          async (id) => {
            if (job.kind === "search") {
              update(job.id, () => ({ current: `analisi di ${name(id)}` }));
              const analyzed = await live.current.command(
                "analyze",
                undefined,
                id,
              );
              // Nothing to write about: drop it now and never find it again.
              if (
                analyzed.lead &&
                shouldDiscard(analyzed.lead, live.current.preferences)
              ) {
                await live.current.command("delete", {
                  ids: [id],
                  remember: true,
                });
                update(job.id, (j) => ({ discarded: j.discarded + 1 }));
                return;
              }
              update(job.id, () => ({ current: `bozza per ${name(id)}` }));
              await draft(id, analyzed.lead);
            } else {
              update(job.id, () => ({ current: `bozza per ${name(id)}` }));
              await draft(id);
            }
          },
          {
            onProgress: (index) =>
              update(job.id, () => ({ finished: ids.slice(0, index) })),
          },
        );
        update(job.id, () => ({
          state: "done",
          finished: ids,
          current: "",
          failures: failures.map((f) => ({ ...f, id: name(f.id) })),
        }));
      } catch (e) {
        update(job.id, () => ({
          state: "done",
          current: "",
          error: e instanceof Error ? e.message : "Lavoro non riuscito",
        }));
      }
    },
    [draft, update],
  );
  // One job at a time, in the order they were started.
  useEffect(() => {
    if (running.current) return;
    const next = jobs.find((j) => j.state === "queued");
    if (!next) return;
    running.current = true;
    void run(next).finally(() => {
      running.current = false;
      setJobs((all) => [...all]);
    });
  }, [jobs, run]);
  const busy = jobs.some((j) => j.state !== "done");
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const add = (
    job: Omit<
      Job,
      | "id"
      | "state"
      | "finished"
      | "current"
      | "skipped"
      | "discarded"
      | "failures"
      | "error"
    >,
  ) =>
    setJobs((all) => [
      ...all.filter(
        (j) =>
          j.state !== "done" || j.kind !== job.kind || j.sector !== job.sector,
      ),
      {
        ...job,
        id: crypto.randomUUID(),
        state: "queued",
        finished: [],
        current: "",
        skipped: 0,
        discarded: 0,
        failures: [],
        error: "",
      },
    ]);
  const value: Context = {
    jobs,
    active:
      jobs.find((j) => j.state === "running") ||
      jobs.find((j) => j.state === "queued"),
    startSearch: (input, sector) =>
      add({
        kind: "search",
        sector,
        label: input.city,
        leadIds: [],
        input,
      }),
    startDrafts: (ids, label, sector) =>
      add({ kind: "drafts", sector, label, leadIds: ids, draftIds: ids }),
    lastSearch: (sector) =>
      [...jobs]
        .reverse()
        .find((j) => j.kind === "search" && j.sector === sector),
    dismiss: (id) =>
      setJobs((all) => all.filter((j) => j.id !== id || j.state !== "done")),
  };
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}
export function useJobs() {
  const value = useContext(JobsContext);
  if (!value) throw new Error("JobsProvider mancante");
  return value;
}
