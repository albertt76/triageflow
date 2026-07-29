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
