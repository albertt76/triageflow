import type {
  Category,
  Channel,
  PlanTier,
  Priority,
  TriageResult,
} from "./types";

/**
 * The triage engine. This is the piece that saves Jordan 90 minutes every
 * morning: instead of reading every ticket and guessing, each ticket is
 * scored automatically from its *content* (not just the subject line — that
 * is exactly how the critical billing issue slipped through for four hours).
 *
 * Everything is transparent: the engine returns the reasons behind a score so
 * a human can sanity-check and override it.
 */

// Signal keywords grouped by the category they most strongly indicate.
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  outage: [
    "down",
    "outage",
    "not loading",
    "can't log in",
    "cannot log in",
    "503",
    "500 error",
    "site is down",
    "everything is broken",
    "nothing works",
  ],
  billing: [
    "charge",
    "charged",
    "invoice",
    "refund",
    "double charged",
    "overcharged",
    "payment",
    "billing",
    "credit card",
    "subscription",
    "receipt",
    "pricing",
  ],
  technical: [
    "error",
    "bug",
    "crash",
    "broken",
    "not working",
    "sync",
    "export",
    "import",
    "api",
    "integration",
    "data loss",
    "missing data",
  ],
  account: [
    "password",
    "reset",
    "locked out",
    "access",
    "permission",
    "add user",
    "remove user",
    "seat",
    "login",
    "2fa",
  ],
  "how-to": [
    "how do i",
    "how to",
    "where is",
    "can i",
    "is it possible",
    "tutorial",
    "documentation",
    "walk me through",
  ],
  "feature-request": [
    "feature request",
    "would be nice",
    "wish",
    "suggestion",
    "please add",
    "roadmap",
    "in the future",
  ],
};

// Words that raise urgency regardless of category.
const URGENCY_KEYWORDS: { term: string; weight: number; label: string }[] = [
  { term: "urgent", weight: 25, label: "customer flagged as urgent" },
  { term: "asap", weight: 25, label: "customer asked for ASAP help" },
  { term: "immediately", weight: 20, label: "time-sensitive language" },
  { term: "emergency", weight: 30, label: "emergency language" },
  { term: "furious", weight: 20, label: "customer is upset" },
  { term: "angry", weight: 18, label: "customer is upset" },
  { term: "unacceptable", weight: 18, label: "customer is upset" },
  { term: "cancel", weight: 22, label: "churn risk (mentions cancelling)" },
  { term: "cancelling", weight: 22, label: "churn risk (mentions cancelling)" },
  { term: "refund", weight: 15, label: "money owed to customer" },
  { term: "double charged", weight: 28, label: "billing error — money at stake" },
  { term: "overcharged", weight: 26, label: "billing error — money at stake" },
  { term: "data loss", weight: 30, label: "possible data loss" },
  { term: "lost all", weight: 26, label: "possible data loss" },
  { term: "deadline", weight: 16, label: "customer has a deadline" },
  { term: "lawyer", weight: 30, label: "legal escalation risk" },
  { term: "chargeback", weight: 28, label: "chargeback risk" },
];

const CATEGORY_BASE_SCORE: Record<Category, number> = {
  outage: 45,
  billing: 30,
  technical: 22,
  account: 18,
  "how-to": 6,
  "feature-request": 2,
};

const PLAN_WEIGHT: Record<PlanTier, number> = {
  enterprise: 20,
  pro: 12,
  starter: 5,
  free: 0,
};

const PLAN_LABEL: Record<PlanTier, string> = {
  enterprise: "Enterprise customer",
  pro: "Pro customer",
  starter: "Starter customer",
  free: "Free plan",
};

// Phone and chat callers are waiting live, so nudge them up slightly. Social
// is public — an unhappy customer posting where others can see carries some
// reputational urgency too.
const CHANNEL_WEIGHT: Record<Channel, number> = {
  phone: 10,
  chat: 6,
  social: 8,
  email: 0,
};

function countMatches(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/** Classify the most likely category from the ticket text. */
export function classifyCategory(subject: string, body: string): Category {
  const text = `${subject} ${body}`.toLowerCase();
  let best: Category = "how-to";
  let bestHits = -1;

  (Object.keys(CATEGORY_KEYWORDS) as Category[]).forEach((category) => {
    const hits = CATEGORY_KEYWORDS[category].reduce(
      (sum, kw) => sum + countMatches(text, kw),
      0,
    );
    // Bias toward higher-severity categories on ties via base score.
    const weighted = hits * 10 + CATEGORY_BASE_SCORE[category] / 100;
    if (hits > 0 && weighted > bestHits) {
      bestHits = weighted;
      best = category;
    }
  });

  return best;
}

function scoreToPriority(score: number): Priority {
  if (score >= 75) return "critical";
  if (score >= 45) return "high";
  if (score >= 22) return "medium";
  return "low";
}

export interface TriageInput {
  subject: string;
  body: string;
  channel: Channel;
  planTier: PlanTier;
  /** Optional override if the category is already known. */
  category?: Category;
  /** Minutes the ticket has already waited, if known. */
  ageMinutes?: number;
}

/**
 * Score a ticket and explain why. Reading the body — not just the subject —
 * is deliberate: it's what stops a "critical billing issue" from looking like
 * "a routine account question."
 */
export function triage(input: TriageInput): TriageResult {
  const category =
    input.category ?? classifyCategory(input.subject, input.body);
  const text = `${input.subject} ${input.body}`.toLowerCase();
  const reasons: string[] = [];

  let score = CATEGORY_BASE_SCORE[category];
  reasons.push(`${labelForCategory(category)} issue`);

  // Urgency keywords, de-duplicated by label so we don't repeat ourselves.
  const seenLabels = new Set<string>();
  for (const { term, weight, label } of URGENCY_KEYWORDS) {
    if (text.includes(term) && !seenLabels.has(label)) {
      score += weight;
      reasons.push(label);
      seenLabels.add(label);
    }
  }

  // Plan tier — enterprise SLAs are contractual.
  score += PLAN_WEIGHT[input.planTier];
  if (PLAN_WEIGHT[input.planTier] > 0) {
    reasons.push(PLAN_LABEL[input.planTier]);
  }

  // Channel.
  score += CHANNEL_WEIGHT[input.channel];
  if (CHANNEL_WEIGHT[input.channel] > 0) {
    reasons.push(
      input.channel === "social"
        ? "Public on social — reputational risk"
        : `Live ${input.channel} — customer is waiting`,
    );
  }

  // Age pressure: something sitting a long time creeps up the queue.
  if (input.ageMinutes && input.ageMinutes > 120) {
    score += 12;
    reasons.push("Aging in the queue");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    priority: scoreToPriority(score),
    score,
    reasons,
    category,
  };
}

export function labelForCategory(category: Category): string {
  switch (category) {
    case "how-to":
      return "How-to";
    case "feature-request":
      return "Feature request";
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}
