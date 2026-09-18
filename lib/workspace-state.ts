import type { Lead, Preferences, Workspace } from "./model";

export type WorkspaceResult = {
  lead?: Lead;
  duplicate?: boolean;
  results?: { lead: Lead; duplicate: boolean }[];
  preferences?: Preferences;
  warning?: string;
  importErrors?: { index: number; error: string }[];
  deleted?: string[];
  skipped?: number;
};

// Merge complete server records, preserving unrelated leads and newer responses.
export function mergeWorkspaceResult(
  current: Workspace,
  result: WorkspaceResult,
): Workspace {
  const records = new Map(current.leads.map((lead) => [lead.id, lead]));
  for (const id of result.deleted || []) records.delete(id);
  const incoming = result.lead
    ? [result.lead]
    : (result.results || []).map((entry) => entry.lead);
  for (const lead of incoming) {
    const previous = records.get(lead.id);
    if (!previous || lead.updated_at >= previous.updated_at)
      records.set(lead.id, lead);
  }
  return {
    ...current,
    leads: [...records.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
    preferences: result.preferences || current.preferences,
  };
}
