import { sql, desc } from "drizzle-orm";
import { integer, sqliteTable, text, index, check } from "drizzle-orm/sqlite-core";

/**
 * The `tickets` table — a single denormalized table that stores the source CSV
 * faithfully (snake_case, its own enums) plus four columns materialized by the
 * triage engine at import time (`triage_*`) so the app never recomputes.
 *
 * Notes tied to the dataset:
 *  - `first_response_at` / `resolved_at` are the CSV's absolute timestamps
 *    (unix ms). They are unreliable as durations, so `resolution_minutes` is
 *    only populated when `resolved_at > first_response_at`.
 *  - Lifecycle: open → no timestamps; pending → first response only;
 *    closed → everything (resolution / resolved_at / CSAT).
 */
export const tickets = sqliteTable(
  "tickets",
  {
    id: integer("id").primaryKey(), // Ticket ID (1..8469)
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerAge: integer("customer_age"),
    customerGender: text("customer_gender", {
      enum: ["Male", "Female", "Other"],
    }),
    productPurchased: text("product_purchased").notNull(),
    dateOfPurchase: text("date_of_purchase"), // ISO 'YYYY-MM-DD'
    ticketType: text("ticket_type").notNull(),
    ticketSubject: text("ticket_subject").notNull(),
    ticketDescription: text("ticket_description").notNull(),
    ticketStatus: text("ticket_status", {
      enum: ["open", "pending", "closed"],
    }).notNull(),
    resolution: text("resolution"),
    sourcePriority: text("source_priority", {
      enum: ["low", "medium", "high", "critical"],
    }).notNull(),
    ticketChannel: text("ticket_channel", {
      enum: ["email", "phone", "chat", "social"],
    }).notNull(),
    firstResponseAt: integer("first_response_at"), // unix ms, NULL if open
    resolvedAt: integer("resolved_at"), // unix ms, NULL unless closed
    customerSatisfactionRating: integer("customer_satisfaction_rating"),

    // App-managed (not in the CSV): which team member owns the ticket, or NULL
    // when unassigned. Assignment is deliberately independent of status — it
    // records ownership, not lifecycle stage.
    assignee: text("assignee"),

    // App-managed: when the ticket was escalated to engineering, or NULL.
    // Kept separate from `assignee` so assigning an owner never changes the
    // displayed status (escalation does, assignment doesn't).
    escalatedAt: integer("escalated_at"),

    // Synthesized creation time, epoch ms (see lib/age.ts). The source
    // timestamps are unusable, so the dataset is rebased onto a window ending
    // "now": closed tickets across the last 2 years, open ones within 30 days.
    // Ticket age is derived live as `now - created_at`, so the SLA clock ticks.
    createdAt: integer("created_at").notNull().default(0),

    // Precomputed SLA boundaries (epoch ms), derived from created_at + the
    // per-priority target in lib/sla.ts. Deterministic, so unlike the live
    // `now - created_at` expression these can be range-scanned via an index:
    //   breached ⟺ breach_at  < now
    //   at risk  ⟺ at_risk_at <= now AND breach_at >= now
    atRiskAt: integer("at_risk_at").notNull().default(0),
    breachAt: integer("breach_at").notNull().default(0),

    // Materialized by the triage engine at import:
    triagePriority: text("triage_priority", {
      enum: ["low", "medium", "high", "critical"],
    }).notNull(),
    triageScore: integer("triage_score").notNull(),
    triageCategory: text("triage_category").notNull(),
    triageReasons: text("triage_reasons", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    resolutionMinutes: integer("resolution_minutes"),
  },
  (t) => [
    index("idx_tickets_status").on(t.ticketStatus),
    index("idx_tickets_triage_pri").on(t.triagePriority),
    index("idx_tickets_channel").on(t.ticketChannel),
    index("idx_tickets_product").on(t.productPurchased),
    index("idx_tickets_assignee").on(t.assignee),
    index("idx_tickets_type").on(t.ticketType),
    // Default "smart priority" sort: status filter then score, descending.
    index("idx_tickets_queue_sort").on(t.ticketStatus, desc(t.triageScore), desc(t.id)),
    // SLA filters — range scans over the precomputed deadlines.
    index("idx_tickets_breach").on(t.ticketStatus, t.breachAt),
    index("idx_tickets_at_risk").on(t.ticketStatus, t.atRiskAt),
    index("idx_tickets_created").on(t.ticketStatus, t.createdAt),
    check(
      "csat_range",
      sql`${t.customerSatisfactionRating} IS NULL OR ${t.customerSatisfactionRating} BETWEEN 1 AND 5`,
    ),
  ],
);

export type TicketRow = typeof tickets.$inferSelect;
export type NewTicketRow = typeof tickets.$inferInsert;
