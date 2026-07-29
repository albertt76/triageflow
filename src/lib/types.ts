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

export type Gender = "Male" | "Female" | "Other";

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
  customerName: string;
  channel: Channel;
  category: Category;
  status: Status;
  priority: Priority;
  /** Numeric triage score, higher = more urgent. */
  score: number;
  reasons: string[];
  /** Minutes since the ticket was created (or, once closed, time to resolve). */
  ageMinutes: number;
  createdAtLabel: string;
  assignee: string | null;
  csat: number | null;
  resolutionMinutes: number | null;

  /**
   * Detail-only fields. The queue list projection omits these for speed; the
   * drawer loads them on demand via `fetchTicketDetail`.
   */
  body?: string;
  resolutionNote?: string | null;
  customerEmail?: string;
  customerAge?: number | null;
  customerGender?: Gender | null;
  productPurchased?: string;
  dateOfPurchase?: string | null;
  ticketType?: string;
  /** Priority the customer/source claimed, as opposed to the engine's. */
  sourcePriority?: Priority;
  createdAtIso?: string;
  firstResponseAtIso?: string | null;
  resolvedAtIso?: string | null;
}
