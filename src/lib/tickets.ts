import "server-only";
import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db/client";
import { tickets, type TicketRow } from "./db/schema";
import { SLA_TARGET_MINUTES, type SlaState } from "./sla";
import type { Category, Priority, Ticket } from "./types";
import { formatAgo } from "./format";

/**
 * Map a DB status + assignee to the app's richer status model.
 *   open   → new        pending → in-progress      closed → resolved
 * An assignee of "Engineering" means it was escalated.
 */
function toAppStatus(row: TicketRow) {
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
export function ageMinutesOf(row: TicketRow, now = Date.now()): number {
  return Math.max(0, Math.round((now - row.createdAt) / 60_000));
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
 * Minutes a ticket has been waiting, computed live from `created_at` against
 * the current time — so the SLA clock advances between requests.
 */
const ageMinutesSql = sql<number>`(
  (cast(strftime('%s','now') as integer) * 1000 - ${tickets.createdAt}) / 60000.0
)`;

/**
 * Fraction of the SLA window consumed, in SQL. Mirrors slaStatus() in sla.ts:
 *   > 1    → breached
 *   >= .75 → at risk
 *   else   → on track
 */
const slaConsumed = sql<number>`(
  ${ageMinutesSql} / (
    case ${tickets.triagePriority}
      when 'critical' then ${SLA_TARGET_MINUTES.critical}
      when 'high'     then ${SLA_TARGET_MINUTES.high}
      when 'medium'   then ${SLA_TARGET_MINUTES.medium}
      else                 ${SLA_TARGET_MINUTES.low}
    end
  )
)`;

function slaCondition(state: SlaState): SQL {
  switch (state) {
    case "breached":
      return sql`${slaConsumed} > 1`;
    case "at-risk":
      return sql`${slaConsumed} >= 0.75 and ${slaConsumed} <= 1`;
    case "on-track":
      return sql`${slaConsumed} < 0.75`;
  }
}

/** Rank used by the "Smart priority" sort — triage score bumped by SLA pressure. */
const smartRank = sql`(${tickets.triageScore} + case
  when ${slaConsumed} > 1 then 40
  when ${slaConsumed} >= 0.75 then 15
  else 0 end)`;

export type SortKey = "smart" | "sla" | "newest" | "oldest";

export interface QueueFilters {
  priority?: Priority | "all";
  sla?: SlaState | "all";
  category?: Category | "all";
  query?: string;
  includeResolved?: boolean;
  sort?: SortKey;
}

/** Build the WHERE clause shared by the queue query, the count, and the export. */
function buildWhere(f: QueueFilters): SQL | undefined {
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
    clauses.push(slaCondition(f.sla as SlaState));
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

function orderFor(sort: SortKey = "smart") {
  switch (sort) {
    case "sla":
      // Closest to (or furthest past) the deadline first.
      return [desc(slaConsumed)];
    case "newest":
      return [desc(tickets.createdAt)];
    case "oldest":
      return [asc(tickets.createdAt)];
    default:
      return [desc(smartRank)];
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
  const where = buildWhere(filters);

  const rows = await db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(...orderFor(filters.sort), desc(tickets.id))
    .limit(PAGE_LIMIT);

  const [matchedRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tickets)
    .where(where);

  const [agg] = await db
    .select({
      open: sql<number>`sum(case when ${tickets.ticketStatus} = 'open' then 1 else 0 end)`,
      pending: sql<number>`sum(case when ${tickets.ticketStatus} = 'pending' then 1 else 0 end)`,
      closed: sql<number>`sum(case when ${tickets.ticketStatus} = 'closed' then 1 else 0 end)`,
      total: sql<number>`count(*)`,
      needAttention: sql<number>`sum(case when ${tickets.ticketStatus} != 'closed' and ${tickets.triagePriority} = 'critical' then 1 else 0 end)`,
      atRisk: sql<number>`sum(case when ${tickets.ticketStatus} != 'closed' and ${slaConsumed} >= 0.75 and ${slaConsumed} <= 1 then 1 else 0 end)`,
    })
    .from(tickets);

  return {
    tickets: rows.map(rowToTicket),
    counts: {
      open: Number(agg.open),
      pending: Number(agg.pending),
      closed: Number(agg.closed),
      total: Number(agg.total),
      needAttention: Number(agg.needAttention),
      atRisk: Number(agg.atRisk),
    },
    matched: Number(matchedRow.n),
    shown: rows.length,
    limit: PAGE_LIMIT,
  };
}

/** Every row matching the filters — used by CSV export (no display limit). */
export async function getTicketsForExport(
  filters: QueueFilters = {},
): Promise<TicketRow[]> {
  return db
    .select()
    .from(tickets)
    .where(buildWhere(filters))
    .orderBy(...orderFor(filters.sort), desc(tickets.id));
}

export async function getTicket(id: number): Promise<Ticket | null> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id));
  return row ? rowToTicket(row) : null;
}

/** Parse the app's "TF-123" id back to the numeric DB key. */
export function parseTicketId(appId: string): number {
  return Number(appId.replace(/^TF-/, ""));
}
