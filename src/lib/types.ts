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
  body: string;
  customerName: string;
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
  resolutionNote: string | null;
}
