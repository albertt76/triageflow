import type { Priority } from "./types";

/**
 * Synthetic `created_at` generation.
 *
 * The source CSV's timestamps are unusable (all clustered in a 2-day window in
 * 2023, with resolution often preceding first response), so we rebase the whole
 * dataset onto a realistic window ending "now":
 *
 *   - Closed tickets  → created any time in the last 2 years (the history).
 *   - Open / pending  → created within the last 30 days (the live queue).
 *
 * Ticket age is then derived live as `now - created_at`, so the SLA clock
 * actually ticks instead of being frozen at seed time.
 *
 * Within the 30-day window, open tickets are **skewed heavily toward recent**
 * rather than spread uniformly. That is how a real queue behaves — most open
 * tickets arrived in the last day or two, and only stragglers linger for weeks.
 * A uniform spread would put nearly every ticket past even the 24h low-priority
 * target, making the SLA states useless.
 *
 * Higher priorities skew fresher still: urgent tickets are either handled or
 * escalated quickly, so old ones don't accumulate in the open queue.
 */

const DAY_MINUTES = 1440;

/** Per-priority shape of the open-ticket age distribution. */
const OPEN_AGE_PROFILE: Record<Priority, { maxDays: number; skew: number }> = {
  critical: { maxDays: 1, skew: 4 },
  high: { maxDays: 4, skew: 3.5 },
  medium: { maxDays: 14, skew: 3 },
  low: { maxDays: 30, skew: 2.5 },
};

/** Closed tickets are spread across the full collection window. */
const HISTORY_DAYS = 730; // 2 years

/**
 * Deterministic PRNG seeded per ticket id, so reseeding reproduces the same
 * relative spread. (Math.random would make every seed run different.)
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Minutes an open ticket has been waiting: `maxAge * u^skew`, which clusters
 * near zero and tails out to the cap.
 */
export function openAgeMinutes(id: number, priority: Priority): number {
  const rand = seededRandom(id * 2654435761);
  const { maxDays, skew } = OPEN_AGE_PROFILE[priority];
  const u = rand();
  return Math.max(1, Math.round(maxDays * DAY_MINUTES * Math.pow(u, skew)));
}

/**
 * The `created_at` timestamp for a ticket, in epoch ms.
 *
 * @param now anchor for the time-skip — pass a single value for the whole seed
 *            run so every row is rebased against the same instant.
 */
export function syntheticCreatedAt(
  id: number,
  priority: Priority,
  isClosed: boolean,
  now: number,
): number {
  if (!isClosed) {
    return now - openAgeMinutes(id, priority) * 60_000;
  }
  // Closed: somewhere in the last 2 years, excluding the most recent day so
  // history and the live queue don't overlap confusingly.
  const rand = seededRandom(id * 40503 + 7);
  const daysAgo = 1 + rand() * (HISTORY_DAYS - 1);
  return now - Math.round(daysAgo * DAY_MINUTES * 60_000);
}
