# Data decisions

How the source CSV was interpreted, cleaned, and turned into the `tickets`
table — and, more importantly, **why**. Read this before changing
[`scripts/seed.ts`](../scripts/seed.ts) or trusting a number the app reports.

The short version: the source is a synthetic (Faker-generated) dataset with
several internally inconsistent fields. Everything below is either a repair, a
deliberate refusal to repair, or a derived value invented to fill a gap.

---

## 1. Source profile

`data/customer_support_tickets.csv` — 8,469 rows, 17 columns, `Ticket ID`
unique and gap-free (1–8469).

Three facts drove most of the decisions:

1. **`First Response Time` / `Time to Resolution` are absolute timestamps, not
   durations** — and they're inconsistent: all cluster in a ~2-day window in
   2023 unrelated to purchase dates, and in roughly half of closed rows the
   resolution timestamp *precedes* the first-response timestamp.
2. **Nulls track the lifecycle cleanly.** Open → no timestamps, no resolution,
   no CSAT. Pending → first response only. Closed → everything. The same 5,700
   rows are null across resolution / duration / CSAT.
3. **It's synthetic.** `@example.com` emails, lorem-ipsum resolution notes, and
   descriptions containing unrendered `{product_purchased}` template tokens.

---

## 2. Decisions

### Normalized the vocabulary
Title-Case headers (`Ticket ID`) → snake_case. Every enum lowercased into a
fixed set: `Social media` → `social`, `Pending Customer Response` → `pending`,
priorities → `low|medium|high|critical`. Enforced with CHECK constraints in
[`schema.ts`](../src/lib/db/schema.ts) so bad values fail at write time.

*Why:* the app's types and the SQL filters both need a closed, predictable
domain.

### Repaired the templated descriptions
Replaced brace-delimited `{product_purchased}` tokens with the real product
name, matched case-insensitively and tolerant of suffixes
(`{Product_purchased}`, `{product_purchased_id}`, `{product_purchased_url}`).

**Deliberately left alone:** brace-less corruptions like `"the
product_purchased attribute"`. **7 rows** still contain a braced token that no
safe pattern catches.

*Why:* a greedy regex would mangle legitimate prose. A handful of visibly
broken descriptions is better than silent corruption of real sentences.

### Distrusted the timestamps
Both are stored raw as epoch-ms. A duration (`resolution_minutes`) is derived
**only** where `resolved_at > first_response_at` — otherwise null.

**Result: 1,402 usable durations out of 2,769 closed tickets.** Every
resolution-time metric in the app is computed over that subset only, and the
Insights page states the sample size on screen.

*Why:* averaging negative durations would produce a confidently wrong number.
Better to report a smaller honest sample and say so.

### Preserved nulls instead of imputing
Lifecycle nulls are meaningful signal, not missing data, so nothing is
backfilled. A null CSAT means "never rated", not "zero".

### Kept the source's opinion alongside the engine's
`source_priority` (what the CSV claimed) is stored next to `triage_priority`
(what the engine computed). Neither overwrites the other.

*Why:* they're directly comparable, which is the interesting comparison — and
it means the engine can be re-tuned and re-evaluated against the original
labels.

### Materialized derived values at import
`triage_priority`, `triage_score`, `triage_category`, and `triage_reasons` are
computed once during seeding, not per request.

*Why:* the queue sorts and filters on them across all 8,469 rows; recomputing
in JS per request would defeat SQL filtering entirely.

---

## 3. Things deliberately NOT done

| Not done | Reason |
|---|---|
| Normalize customers into their own table | 139 emails repeat across rows, so email isn't a trustworthy key in synthetic data. A single denormalized table matches how the app queries. |
| Dedupe or fuzzy-match customer names | Same reason — no reliable identity column. |
| Impute `planTier` | **Not present in the source at all.** Every row is defaulted to `starter`. |
| Repair brace-less token corruption | Unsafe to pattern-match (see above). |
| Clean the lorem-ipsum resolution notes | They're obviously synthetic; rewriting them would fabricate content. |

> ⚠️ **The `planTier` default is the most consequential assumption.** Plan tier
> is a scoring signal in [`triage.ts`](../src/lib/triage.ts) (enterprise +20,
> pro +12, starter +5, free 0). Because every imported row is `starter`, that
> signal is effectively **switched off** for the whole dataset — it only varies
> for tickets created through the New Ticket form. Any analysis of "do
> enterprise customers get faster service" is meaningless on this data.

---

## 4. Invented fields

### `created_at` — the time-skip
The source timestamps are unusable, so the dataset is **rebased onto a window
ending at seed time** ([`age.ts`](../src/lib/age.ts)):

| Tickets | Created |
|---|---|
| Closed (history) | any time in the last **2 years** |
| Open / pending (live queue) | within the last **30 days** |

Age is then derived **live** as `now - created_at`, in both JS and SQL — so the
SLA clock actually advances between page loads rather than being frozen at seed
time. Closed tickets show their `resolution_minutes` instead.

**Open tickets are skewed toward recent, not spread uniformly.** Each priority
has its own cap and curve:

```
age = maxDays * 1440 * u^skew        // u ∈ [0,1), deterministic per id

critical  maxDays 1   skew 4
high      maxDays 4   skew 3.5
medium    maxDays 14  skew 3
low       maxDays 30  skew 2.5
```

*Why skewed:* a real queue is mostly recent arrivals with a thin tail of
stragglers. A uniform spread over 30 days would put nearly every ticket past
even the 24 h low-priority target, so every row would render breached and the
SLA states would carry no information.

*Why per-priority:* urgent tickets are handled or escalated quickly, so old
ones don't accumulate in the open queue; low-priority ones do.

*Why deterministic:* seeded per row id, so reseeding reproduces the same
relative spread instead of reshuffling the whole queue.

> **Reseeding re-anchors the window.** `created_at` is fixed at seed time and
> age grows from there, so a database left untouched for weeks will drift
> toward everything-breached. Re-run `npm run db:seed` to rebase onto a fresh
> "now".

**This is synthesized data, not measurement.** Any "how long do tickets wait"
claim describes the generated distribution above.

### SLA state — derived, in two places
Targets are first-response times per priority
([`sla.ts`](../src/lib/sla.ts)): critical 30 min, high 2 h, medium 8 h,
low 24 h. Then `consumed = age / target`, where age is derived live from
`created_at`:

| Consumed | State |
|---|---|
| `> 1` | breached |
| `>= 0.75` | at risk |
| else | on track |

Two derived columns, `at_risk_at` and `breach_at`, are stored at write time from
`created_at` + the target (`slaDeadlines()` in [`sla.ts`](../src/lib/sla.ts)).
They exist for **indexability**: the old form compared
`strftime('%s','now') - created_at` per row, which is non-deterministic and so
can never use an index. The stored deadlines turn every SLA filter into a plain
range scan against a bound `now` parameter:

```
breached ⟺ breach_at  <  now
at risk  ⟺ at_risk_at <= now AND breach_at >= now
on track ⟺ at_risk_at >  now
```

Verified identical to the old expression and to the JS implementation
(4,058 / 162 / 1,480 across all three).

Implemented **twice** — in JS (`slaStatus()`) for rendering, and as a SQL
fragment in [`tickets.ts`](../src/lib/tickets.ts) for whole-table filtering.
They must stay in sync; verified equal immediately after a seed at **4,058
breached / 162 at-risk / 1,480 on-track**. If you change a threshold or target,
change both and re-check.

Because age is now live, **these counts drift upward into "breached" as time
passes** — they are a snapshot at seed time, not fixed properties of the data.
The at-risk band is narrow by construction (75–100 % of target), so it will
always hold a small slice of the queue at any given instant.

Notes: the clock measures **first response**, not resolution, and the priority
used is the *engine's*, not the CSV's. Thresholds and targets are hardcoded
constants, not per-customer contractual terms.

---

## 5. Reference figures

Baseline after a clean `npm run db:seed` — useful for spotting drift:

| Metric | Value |
|---|---|
| Total rows | 8,469 |
| open / pending / closed | 2,819 / 2,881 / 2,769 |
| Rows with usable duration | 1,402 |
| Rows with CSAT | 2,769 |
| SLA breached / at-risk / on-track *(at seed time; drifts)* | 4,058 / 162 / 1,480 |
| Open-ticket age range | 0 – 30 days (avg ≈ 4.7 d) |
| Closed-ticket age range | 1 – 730 days |
| Residual `{...product_purchased...}` tokens | 7 |
| Distinct products / subjects / types | 42 / 16 / 5 |
| Emails appearing more than once | 139 |
