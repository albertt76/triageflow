import type {
  QueueFilters,
  SearchField,
  SortKey,
  StatusFilter,
} from "./tickets";
import type { SlaState } from "./sla";
import type { Category, Channel, Priority } from "./types";

const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];
const SLA_STATES: SlaState[] = ["breached", "at-risk", "on-track"];
const CATEGORIES: Category[] = [
  "billing",
  "technical",
  "account",
  "outage",
  "how-to",
  "feature-request",
];
const CHANNELS: Channel[] = ["email", "phone", "chat", "social"];
const STATUSES: StatusFilter[] = [
  "unresolved",
  "new",
  "in-progress",
  "escalated",
  "resolved",
  "all",
];
export const DEFAULT_STATUS: StatusFilter = "unresolved";
const SORTS: SortKey[] = ["smart", "sla", "newest", "oldest"];
const SEARCH_FIELDS: SearchField[] = ["subject", "customer", "email", "id"];
export const DEFAULT_SEARCH_FIELD: SearchField = "subject";

function pick<T extends string>(
  value: string | undefined,
  allowed: T[],
): T | "all" {
  return value && (allowed as string[]).includes(value) ? (value as T) : "all";
}

/** Parse URL search params into validated queue filters. */
export function parseQueueFilters(
  params: Record<string, string | string[] | undefined>,
): QueueFilters {
  const get = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const sortRaw = get("sort");
  return {
    priority: pick(get("priority"), PRIORITIES),
    sla: pick(get("sla"), SLA_STATES),
    category: pick(get("category"), CATEGORIES),
    channel: pick(get("channel"), CHANNELS),
    // Free-form (43 products); trusted only as an equality match in SQL.
    product: get("product")?.trim() || "all",
    query: get("q") ?? "",
    searchField: (() => {
      const raw = get("field");
      return raw && (SEARCH_FIELDS as string[]).includes(raw)
        ? (raw as SearchField)
        : DEFAULT_SEARCH_FIELD;
    })(),
    status: (() => {
      const raw = get("status");
      if (raw && (STATUSES as string[]).includes(raw))
        return raw as StatusFilter;
      // Legacy links used ?resolved=1 to mean "include closed tickets".
      return get("resolved") === "1" ? "all" : DEFAULT_STATUS;
    })(),
    sort:
      sortRaw && (SORTS as string[]).includes(sortRaw)
        ? (sortRaw as SortKey)
        : "smart",
  };
}

/** Serialize filters back to a query string (omitting defaults). */
export function filtersToQuery(f: QueueFilters): string {
  const p = new URLSearchParams();
  if (f.priority && f.priority !== "all") p.set("priority", f.priority);
  if (f.sla && f.sla !== "all") p.set("sla", f.sla);
  if (f.category && f.category !== "all") p.set("category", f.category);
  if (f.channel && f.channel !== "all") p.set("channel", f.channel);
  if (f.product && f.product !== "all") p.set("product", f.product);
  if (f.query?.trim()) p.set("q", f.query.trim());
  // Kept even with an empty query so the chosen field stays selected while the
  // user clears the box to type a new value.
  if (f.searchField && f.searchField !== DEFAULT_SEARCH_FIELD) {
    p.set("field", f.searchField);
  }
  if (f.status && f.status !== DEFAULT_STATUS) p.set("status", f.status);
  if (f.sort && f.sort !== "smart") p.set("sort", f.sort);
  return p.toString();
}
