// Core domain types for TriageFlow

export type Channel = "email" | "chat" | "phone" | "social";

export type Category =
  | "billing"
  | "technical"
  | "account"
  | "outage"
  | "how-to"
  | "feature-request";

export type Priority = "critical" | "high" | "medium" | "low";

export type Status = "new" | "in-progress" | "escalated" | "resolved";

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export interface TriageResult {
  priority: Priority;
  score: number;
  /** Human-readable reasons the engine assigned this priority. */
  reasons: string[];
  category: Category;
}

export interface Ticket {
  id: string;
  subject: string;
  /**
   * Full customer message. Absent on queue-list rows — the list query skips the
   * wide text columns for speed; the drawer loads them on demand.
   */
  body?: string;
  customerName: string;
  /** Detail-only, like `body` — the list projection omits it. */
  customerEmail?: string;
  planTier: PlanTier;
  channel: Channel;
  category: Category;
  status: Status;
  priority: Priority;
  /** Numeric triage score, higher = more urgent. */
  score: number;
  reasons: string[];
  /** Minutes since the ticket was created (relative to app load). */
  ageMinutes: number;
  createdAtLabel: string;
  assignee: string | null;
  /** Resolved tickets only. */
  csat: number | null;
  resolutionMinutes: number | null;
  /** Like `body`, absent on list rows until the drawer loads the detail. */
  resolutionNote?: string | null;
}
