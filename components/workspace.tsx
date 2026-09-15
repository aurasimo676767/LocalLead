"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  type Workspace,
  type PublicConfig,
  type Lead,
  contactable,
  defaultPreferences,
  newLead,
  now,
  uid,
  preferencesSchema,
} from "@/lib/model";
import { demoWorkspace, demoLeads } from "@/lib/demo";
import { manualSources, patchLead } from "@/lib/lead-actions";
import { inputSchema, discoverySchema } from "@/lib/validation";
import { duplicate } from "@/lib/utils";
import { scoreLead } from "@/lib/scoring";
import { fallbackMessage, similarity } from "@/lib/messaging";
type Result = {
  lead?: Lead;
  duplicate?: boolean;
  results?: { lead: Lead; duplicate: boolean }[];
  warning?: string;
};
type Context = Workspace & {
  config: PublicConfig;
  loading: boolean;
  error: string;
  notice: string;
  notify: (s: string) => void;
  reload: () => Promise<void>;
  command: (action: string, data?: unknown, id?: string) => Promise<Result>;
};
const Context = createContext<Context | null>(null);
const storageKey = "locallead.workspace.v1";
export function WorkspaceProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config: PublicConfig;
}) {
  const [state, setState] = useState<Workspace>({
    leads: [],
    preferences: defaultPreferences,
  });
  const ref = useRef(state);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, notify] = useState("");
  const replace = useCallback((s: Workspace) => {
    ref.current = s;
    setState(s);
  }, []);
  const reload = useCallback(async () => {
    setError("");
    try {
      if (config.demo) {
        const stored = localStorage.getItem(storageKey);
        const data = stored ? JSON.parse(stored) : demoWorkspace();
        if (!Array.isArray(data.leads)) throw new Error("Dati demo non validi");
        replace({
          leads: data.leads,
          preferences: preferencesSchema.parse(data.preferences),
        });
        if (!stored) localStorage.setItem(storageKey, JSON.stringify(data));
      } else {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        replace(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile caricare i dati");
    } finally {
      setLoading(false);
    }
  }, [config.demo, replace]);
  useEffect(() => {
    const initial = setTimeout(() => void reload(), 0);
    const update = (e: StorageEvent) => {
      if (e.key === storageKey) void reload();
    };
    window.addEventListener("storage", update);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("storage", update);
    };
  }, [reload]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => notify(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  async function command(
    action: string,
    data?: unknown,
    id?: string,
  ): Promise<Result> {
    if (!config.demo) {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data, id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Operazione non riuscita");
      await reload();
      if (result.warning) notify(result.warning);
      return result;
    }
    const stored = localStorage.getItem(storageKey);
    const current: Workspace = structuredClone(
      stored ? JSON.parse(stored) : ref.current,
    );
    let result: Result = {};
    if (action === "settings")
      current.preferences = preferencesSchema.parse(data);
    else if (action === "discover") {
      const input = discoverySchema.parse(data);
      const results: { lead: Lead; duplicate: boolean }[] = [];
      for (const candidate of demoLeads()
        .filter((l) => input.categories.includes(l.category))
        .slice(0, input.limit)) {
        const found = duplicate(candidate, current.leads);
        if (found?.do_not_contact) continue;
        if (found) results.push({ lead: found, duplicate: true });
        else {
          current.leads.push(candidate);
          results.push({ lead: candidate, duplicate: false });
        }
      }
      result = { results };
    } else if (action === "create") {
      const lead = scoreLead(manualSources(newLead(inputSchema.parse(data))));
      const found = duplicate(lead, current.leads);
      if (found) result = { lead: found, duplicate: true };
      else {
        current.leads.unshift(lead);
        result = { lead, duplicate: false };
      }
    } else {
      const index = current.leads.findIndex((l) => l.id === id);
      if (index < 0) throw new Error("Lead non trovato");
      let l = current.leads[index];
      if (action === "patch") {
        l = patchLead(l, data);
        const found = duplicate(l, current.leads);
        if (found) throw new Error(`Lead già presente: ${found.name}`);
      }
      if (action === "analyze") {
        l = scoreLead(l);
        if (!l.analysis.analyzed_at) {
          l.analysis.analyzed_at = now();
          l.analysis.warnings = [
            "Modalità demo: nessun sito reale viene visitato. Verifica manualmente le informazioni o configura Supabase per l’analisi live.",
          ];
        }
      }
      if (action === "message") {
        if (!contactable(l))
          throw new Error(
            "Verifica prima un’opportunità concreta e i canali di contatto",
          );
        const recent = current.leads
          .flatMap((x) => x.messages)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 15)
          .map((m) => m.text);
        const variants = Array.from({ length: 8 }, (_, i) =>
          fallbackMessage(
            l,
            current.preferences,
            recent.length + l.messages.length + i,
          ),
        );
        variants.sort(
          (a, b) =>
            Math.max(0, ...recent.map((t) => similarity(a, t))) -
            Math.max(0, ...recent.map((t) => similarity(b, t))),
        );
        l.messages.push({
          id: uid(),
          message_type: "outreach",
          text: variants[0],
          model: "demo locale",
          created_at: now(),
        });
      }
      if (action === "save_message") {
        const text = String((data as { text: string }).text).trim();
        if (!text || text.length > 3000)
          throw new Error("Messaggio vuoto o troppo lungo");
        l.messages.push({
          id: uid(),
          message_type: "edited",
          text,
          model: "manual",
          created_at: now(),
        });
      }
      l.updated_at = now();
      current.leads[index] = l;
      result = { lead: l };
    }
    // Persist before announcing success: quota/private-mode errors remain visible.
    localStorage.setItem(storageKey, JSON.stringify(current));
    replace(current);
    return result;
  }
  return (
    <Context.Provider
      value={{
        ...state,
        config,
        loading,
        error,
        notice,
        notify,
        reload,
        command,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const c = useContext(Context);
  if (!c) throw new Error("Workspace mancante");
  return c;
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
