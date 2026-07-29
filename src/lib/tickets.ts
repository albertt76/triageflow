import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db/client";
import { tickets, type TicketRow } from "./db/schema";
import { type SlaState } from "./sla";
import type { Category, Priority, Ticket } from "./types";
import { formatAgo } from "./format";

/** Cache tag for the unfiltered headline counts; busted by the write actions. */
export const QUEUE_COUNTS_TAG = "queue-counts";

/**
 * Map a DB status + assignee to the app's richer status model.
 *   open   → new        pending → in-progress      closed → resolved
 * An assignee of "Engineering" means it was escalated.
 */
function toAppStatus(row: Pick<TicketRow, "assignee" | "ticketStatus">) {
  if (row.assignee === "Engineering") return "escalated" as const;
  switch (row.ticketStatus) {
    case "open":
      return "new" as const;
    case "pending":
      return "in-progress" as const;
    case "closed":
      return "resolved" as const;
  }
}

/** Minutes since the ticket was created, derived live. */
export function ageMinutesOf(
  row: Pick<TicketRow, "createdAt">,
  now = Date.now(),
): number {
  return Math.max(0, Math.round((now - row.createdAt) / 60_000));
}

/**
 * Columns the queue list actually renders. Deliberately excludes the wide
 * `ticket_description` and `resolution` text — those are only needed by the
 * drawer and are fetched on demand by `getTicket()`. Selecting them here made
 * the list query fetch ~2.5× the bytes and forced the sort to materialize wide
 * rows, which is what made cold Turso reads take seconds.
 */
const LIST_COLUMNS = {
  id: tickets.id,
  ticketSubject: tickets.ticketSubject,
  customerName: tickets.customerName,
  ticketChannel: tickets.ticketChannel,
  ticketStatus: tickets.ticketStatus,
  triagePriority: tickets.triagePriority,
  triageScore: tickets.triageScore,
  triageCategory: tickets.triageCategory,
  triageReasons: tickets.triageReasons,
  createdAt: tickets.createdAt,
  resolutionMinutes: tickets.resolutionMinutes,
  customerSatisfactionRating: tickets.customerSatisfactionRating,
  assignee: tickets.assignee,
} as const;

/** The subset of a ticket row needed to render a list entry. */
type ListRow = {
  [K in keyof typeof LIST_COLUMNS]: TicketRow[K];
};

/** Shared mapping for the fields present on both list and detail rows. */
function baseTicketFields(row: ListRow) {
  const resolved = row.ticketStatus === "closed";
  // Closed tickets report how long they took; open ones how long they've waited.
  const ageMinutes = resolved
    ? (row.resolutionMinutes ?? 0)
    : ageMinutesOf(row);
  return {
    id: `TF-${row.id}`,
    subject: row.ticketSubject,
    customerName: row.customerName,
    planTier: "starter" as const,
    channel: row.ticketChannel,
    category: row.triageCategory as Category,
    status: toAppStatus(row),
    priority: row.triagePriority,
    score: row.triageScore,
    reasons: row.triageReasons ?? [],
    ageMinutes,
    createdAtLabel: resolved
      ? `resolved in ${row.resolutionMinutes ?? "—"}m`
      : formatAgo(ageMinutes),
    assignee: row.assignee,
    csat: row.customerSatisfactionRating,
    resolutionMinutes: row.resolutionMinutes,
  };
}

/** List entry — `body` and `resolutionNote` are absent until the drawer loads them. */
export function listRowToTicket(row: ListRow): Ticket {
  return baseTicketFields(row);
}

export function rowToTicket(row: TicketRow): Ticket {
  const resolved = row.ticketStatus === "closed";
  // Closed tickets report how long they took; open ones how long they've waited.
  const ageMinutes = resolved
    ? (row.resolutionMinutes ?? 0)
    : ageMinutesOf(row);
  return {
    id: `TF-${row.id}`,
    subject: row.ticketSubject,
    body: row.ticketDescription,
    customerName: row.customerName,
    planTier: "starter", // not captured in the source data
    channel: row.ticketChannel,
    category: row.triageCategory as Category,
    status: toAppStatus(row),
    priority: row.triagePriority,
    score: row.triageScore,
    reasons: row.triageReasons ?? [],
    ageMinutes,
    createdAtLabel: resolved
      ? `resolved in ${row.resolutionMinutes ?? "—"}m`
      : formatAgo(ageMinutes),
    assignee: row.assignee,
    csat: row.customerSatisfactionRating,
    resolutionMinutes: row.resolutionMinutes,
    resolutionNote: row.resolution,
  };
}

// --- SQL fragments ----------------------------------------------------------

/**
 * SLA state in SQL, expressed as range comparisons against the precomputed
 * `breach_at` / `at_risk_at` columns and a bound `now` parameter.
 *
 * The previous form computed `strftime('%s','now') - created_at` per row, which
 * is non-deterministic and therefore impossible to index. These are plain
 * integer comparisons on indexed columns, and mirror `slaStatus()` in sla.ts:
 *   breach_at  <  now                      → breached
 *   at_risk_at <= now <= breach_at         → at risk
 *   at_risk_at >  now                      → on track
 */
function slaCondition(state: SlaState, now: number): SQL {
  switch (state) {
    case "breached":
      return sql`${tickets.breachAt} < ${now}`;
    case "at-risk":
      return sql`${tickets.atRiskAt} <= ${now} and ${tickets.breachAt} >= ${now}`;
    case "on-track":
      return sql`${tickets.atRiskAt} > ${now}`;
  }
}

/** Rank used by the "Smart priority" sort — triage score bumped by SLA pressure. */
function smartRankSql(now: number) {
  return sql`(${tickets.triageScore} + case
    when ${tickets.breachAt} < ${now} then 40
    when ${tickets.atRiskAt} <= ${now} then 15
    else 0 end)`;
}

export type SortKey = "smart" | "sla" | "newest" | "oldest";

export interface QueueFilters {
  priority?: Priority | "all";
  sla?: SlaState | "all";
  category?: Category | "all";
  query?: string;
  includeResolved?: boolean;
  sort?: SortKey;
}

/** Build the WHERE clause shared by the queue query and the export. */
function buildWhere(f: QueueFilters, now: number): SQL | undefined {
  const clauses: SQL[] = [];

  // SLA state is only meaningful for unresolved tickets.
  const slaActive = f.sla && f.sla !== "all";
  if (!f.includeResolved || slaActive) {
    clauses.push(inArray(tickets.ticketStatus, ["open", "pending"]));
  }
  if (f.priority && f.priority !== "all") {
    clauses.push(eq(tickets.triagePriority, f.priority));
  }
  if (slaActive) {
    clauses.push(slaCondition(f.sla as SlaState, now));
  }
  if (f.category && f.category !== "all") {
    clauses.push(eq(tickets.triageCategory, f.category));
  }
  const q = f.query?.trim();
  if (q) {
    const pattern = `%${q.toLowerCase()}%`;
    const idDigits = q.replace(/^tf-?/i, "");
    const idClause = /^\d+$/.test(idDigits)
      ? sql`cast(${tickets.id} as text) like ${`%${idDigits}%`}`
      : undefined;
    clauses.push(
      or(
        like(sql`lower(${tickets.ticketSubject})`, pattern),
        like(sql`lower(${tickets.customerName})`, pattern),
        ...(idClause ? [idClause] : []),
      )!,
    );
  }

  return clauses.length ? and(...clauses) : undefined;
}

function orderFor(sort: SortKey = "smart", now: number) {
  switch (sort) {
    case "sla":
      // Soonest (or furthest past) deadline first — an indexed range order now
      // that the deadline is a stored column rather than a live expression.
      return [asc(tickets.breachAt)];
    case "newest":
      return [desc(tickets.createdAt)];
    case "oldest":
      return [asc(tickets.createdAt)];
    default:
      return [desc(smartRankSql(now))];
  }
}

export interface QueueCounts {
  open: number;
  pending: number;
  closed: number;
  total: number;
  needAttention: number;
  atRisk: number;
}

export interface QueueData {
  tickets: Ticket[];
  counts: QueueCounts;
  /** Rows matching the current filters across the WHOLE table. */
  matched: number;
  /** How many of those are actually loaded into the page. */
  shown: number;
  limit: number;
}

const PAGE_LIMIT = 200;

/**
 * The queue. Filtering, sorting and counting all happen in SQL over the full
 * table, so a filter like "at risk" reflects every matching row in the
 * database — the row limit only caps what we render.
 */
export async function getQueueData(
  filters: QueueFilters = {},
): Promise<QueueData> {
  const now = Date.now();
  const where = buildWhere(filters, now);

  // One round-trip: the page of rows plus the total match count, via a window
  // function. (Previously two separate queries to Turso.)
  const rowsPromise = db
    .select({ ...LIST_COLUMNS, matched: sql<number>`count(*) over ()` })
    .from(tickets)
    .where(where)
    .orderBy(...orderFor(filters.sort, now), desc(tickets.id))
    .limit(PAGE_LIMIT);

  // The headline counts don't depend on the filters, so they're cached and
  // don't re-run on every filter change.
  const [rows, counts] = await Promise.all([rowsPromise, getQueueCounts()]);

  return {
    tickets: rows.map(listRowToTicket),
    counts,
    matched: rows.length ? Number(rows[0].matched) : 0,
    shown: rows.length,
    limit: PAGE_LIMIT,
  };
}

/**
 * Unfiltered headline counts. Cached because they're identical for every filter
 * combination — re-querying them on each filter change was a wasted round-trip.
 * Write actions bust the tag, and the short TTL keeps the live SLA numbers from
 * going stale (`atRisk` moves as the clock advances).
 */
export const getQueueCounts = unstable_cache(
  async (): Promise<QueueCounts> => {
    const now = Date.now();
    const [agg] = await db
      .select({
        open: sql<number>`sum(case when ${tickets.ticketStatus} = 'open' then 1 else 0 end)`,
        pending: sql<number>`sum(case when ${tickets.ticketStatus} = 'pending' then 1 else 0 end)`,
        closed: sql<number>`sum(case when ${tickets.ticketStatus} = 'closed' then 1 else 0 end)`,
        total: sql<number>`count(*)`,
        needAttention: sql<number>`sum(case when ${tickets.ticketStatus} != 'closed' and ${tickets.triagePriority} = 'critical' then 1 else 0 end)`,
        atRisk: sql<number>`sum(case when ${tickets.ticketStatus} != 'closed' and ${tickets.atRiskAt} <= ${now} and ${tickets.breachAt} >= ${now} then 1 else 0 end)`,
      })
      .from(tickets);

    return {
      open: Number(agg.open),
      pending: Number(agg.pending),
      closed: Number(agg.closed),
      total: Number(agg.total),
      needAttention: Number(agg.needAttention),
      atRisk: Number(agg.atRisk),
    };
  },
  ["queue-counts"],
  { tags: [QUEUE_COUNTS_TAG], revalidate: 60 },
);

/** Every row matching the filters — used by CSV export (no display limit). */
export async function getTicketsForExport(
  filters: QueueFilters = {},
): Promise<TicketRow[]> {
  const now = Date.now();
  // Export keeps the full projection — the CSV includes description/resolution.
  return db
    .select()
    .from(tickets)
    .where(buildWhere(filters, now))
    .orderBy(...orderFor(filters.sort, now), desc(tickets.id));
}

export async function getTicket(id: number): Promise<Ticket | null> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id));
  return row ? rowToTicket(row) : null;
}

/** Parse the app's "TF-123" id back to the numeric DB key. */
export function parseTicketId(appId: string): number {
  return Number(appId.replace(/^TF-/, ""));
}
