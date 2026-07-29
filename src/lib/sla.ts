import type { Priority } from "./types";

/**
 * SLA targets — the first-response time each priority is expected to hit.
 * These are the numbers that decide whether something is "slipping."
 */
export const SLA_TARGET_MINUTES: Record<Priority, number> = {
  critical: 30,
  high: 120, // 2 hours
  medium: 480, // 8 hours (1 business day-ish)
  low: 1440, // 24 hours
};

/**
 * Fraction of the window after which a ticket is "at risk". Shared by the JS
 * implementation below and the SQL deadline columns, so the two can't drift.
 */
export const SLA_AT_RISK_FRACTION = 0.75;

/**
 * When a ticket created at `createdAt` crosses each SLA boundary. Deterministic
 * — no reference to "now" — so these can be stored as columns and compared with
 * an indexed range scan instead of a per-row function call.
 */
export function slaDeadlines(
  priority: Priority,
  createdAt: number,
): { atRiskAt: number; breachAt: number } {
  const windowMs = SLA_TARGET_MINUTES[priority] * 60_000;
  return {
    atRiskAt: createdAt + Math.round(windowMs * SLA_AT_RISK_FRACTION),
    breachAt: createdAt + windowMs,
  };
}

export type SlaState = "on-track" | "at-risk" | "breached";

export interface SlaStatus {
  state: SlaState;
  targetMinutes: number;
  remainingMinutes: number;
  /** 0–1, how much of the SLA window has been consumed. */
  consumed: number;
}

export function slaStatus(priority: Priority, ageMinutes: number): SlaStatus {
  const targetMinutes = SLA_TARGET_MINUTES[priority];
  const remainingMinutes = targetMinutes - ageMinutes;
  const consumed = Math.max(0, Math.min(1.5, ageMinutes / targetMinutes));

  let state: SlaState;
  if (remainingMinutes < 0) {
    state = "breached";
  } else if (consumed >= 0.75) {
    state = "at-risk";
  } else {
    state = "on-track";
  }

  return { state, targetMinutes, remainingMinutes, consumed };
}
