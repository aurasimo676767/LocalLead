import { contactable, contacted, type Lead, type Preferences } from "./model";
import { buildOutreachContext } from "./messaging";
import { isLandlinePhone } from "./utils";
import { sectorOf, type Sector } from "./sector";

export type ListMode = "all" | "contacted" | "archive";
const finished = ["archived", "bad_lead", "not_interested", "replied_negative"];
/** What belongs on a list page, before any filter the user picks. */
export function pageLeads(
  leads: Lead[],
  mode: ListMode,
  sector: Sector,
  showContacted = false,
) {
  return leads.filter(
    (l) =>
      sectorOf(l.category) === sector &&
      !isLandlinePhone(l.phone) &&
      (mode !== "all" ||
        ((!contacted(l) || showContacted) &&
          !l.do_not_contact &&
          !finished.includes(l.status))) &&
      (mode !== "contacted" || contacted(l)) &&
      (mode !== "archive" ||
        l.do_not_contact ||
        ["archived", "bad_lead", "not_interested"].includes(l.status)),
  );
}
const open = (item: Lead) =>
  !item.do_not_contact &&
  !["archived", "bad_lead", "not_interested"].includes(item.status);
/**
 * The leads the arrows on a lead page step through. Opened from a search they
 * follow that search's order; either way they never leave the lead's sector.
 */
export function detailQueue(lead: Lead, leads: Lead[], batch?: string[]) {
  const sector = sectorOf(lead.category);
  const same = (item: Lead) => sectorOf(item.category) === sector;
  if (batch?.includes(lead.id))
    return batch
      .map((id) => leads.find((item) => item.id === id))
      .filter(
        (item): item is Lead =>
          !!item && same(item) && (item.id === lead.id || open(item)),
      );
  return leads.filter((item) => same(item) && open(item));
}
export const sectorHome = (sector: Sector) =>
  sector === "alloggi" ? "/alloggi" : "/leads";
/** The menu entry to highlight: a lead page belongs to its own sector. */
export function activeNav(path: string, leads: Lead[]) {
  if (path.startsWith("/alloggi")) return "/alloggi";
  const id = path.match(/^\/leads\/([^/]+)$/)?.[1];
  if (id && !["new", "import"].includes(id)) {
    const lead = leads.find((l) => l.id === id);
    return lead && sectorOf(lead.category) === "alloggi"
      ? "/alloggi"
      : "/leads";
  }
  return path.startsWith("/leads") ? "/leads" : path;
}
/** A contactable lead with a verified reason and no draft yet. */
export const needsDraft = (lead: Lead, prefs: Preferences) =>
  contactable(lead) &&
  !lead.messages.length &&
  buildOutreachContext(lead, prefs).status === "ready";
/**
 * Nothing to write about: no verified reason for a draft, or a zero score
 * (closed, excellent site, out of target). Searches drop these straight away.
 * A lead with contact history or an opt-out is never dropped.
 */
export const shouldDiscard = (lead: Lead, prefs: Preferences) =>
  !contacted(lead) &&
  !lead.do_not_contact &&
  (lead.lead_score === 0 ||
    buildOutreachContext(lead, prefs).status !== "ready");
