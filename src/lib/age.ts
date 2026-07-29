import type { Priority } from "./types";

/**
 * The source timestamps are unusable as a live clock, so we synthesize a stable
 * "minutes waited" from the id — deterministic and well-spread, good enough to
 * drive the SLA meters. Higher-priority tickets tend to look fresher (a healthy
 * queue answers them faster). This is computed once at seed time and stored in
 * `tickets.age_minutes` so SQL can filter/sort by SLA state across the whole
 * table, not just the rows loaded into the client.
 */
const PRIORITY_SHRINK: Record<Priority, number> = {
  critical: 0.25,
  high: 0.5,
  medium: 0.85,
  low: 1,
};

export function synthAgeMinutes(id: number, priority: Priority): number {
  const base = 8 + ((id * 137) % 1440); // 8..1447 min
  return Math.round(base * PRIORITY_SHRINK[priority]);
}
