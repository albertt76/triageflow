# TriageFlow

A support-triage app built for **Jordan**, the Support Specialist at TechFlow. It turns the 90-minute morning ritual of manually sorting 200–300 tickets into a queue that's already triaged, ranked, and watched for SLA breaches — so nothing slips.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**, backed by a local **SQLite database (Drizzle ORM + libSQL)** seeded from a real 8,469-row support-ticket dataset.

## Run it

```bash
npm install
npm run db:generate   # emit the SQL migration from the Drizzle schema
npm run db:seed       # create data/triageflow.db and load the CSV (also runs migrations)
npm run dev
```

Then open http://localhost:3000 (sign in with **Use demo credentials**).

`db:seed` is idempotent — re-run it any time to reset the database to the clean 8,469-row baseline. Point at a hosted Turso DB instead of the local file by setting `DATABASE_URL` / `DATABASE_AUTH_TOKEN`.

## Data & storage layer

- **Source:** [`data/customer_support_tickets.csv`](data/customer_support_tickets.csv) (8,469 rows) — committed to the repo, so `npm run db:seed` works straight after a clone. Seed from a different export with `CSV_PATH=…`.
- **Engine:** SQLite via Drizzle ORM + `@libsql/client` (prebuilt binaries — no native build). Local file at `data/triageflow.db` (git-ignored, regenerable).
- **Table:** one denormalized `tickets` table ([src/lib/db/schema.ts](src/lib/db/schema.ts)) storing the CSV faithfully (snake_case, enum + CSAT constraints, indexed for the queue sort and analytics) **plus four columns materialized by the triage engine at import** (`triage_priority/score/category/reasons`) so the app never recomputes.
- **Seed pipeline** ([scripts/seed.ts](scripts/seed.ts)): normalizes enums (`Social media`→`social`, `Pending Customer Response`→`pending`), substitutes the CSV's unrendered `{product_purchased}` placeholders, parses the timestamps, and runs each row through [triage.ts](src/lib/triage.ts).
- **Reads** are Server Components calling [src/lib/tickets.ts](src/lib/tickets.ts) / [src/lib/insights.ts](src/lib/insights.ts); **writes** (escalate / start / resolve / new ticket) are **server actions** in [src/app/actions.ts](src/app/actions.ts) that persist to SQLite and revalidate. The DB is never imported into a client module (`import "server-only"` guards it).

## Filtering, sorting & export

All filtering, sorting, and counting happen **in SQL across the whole table** — not over a client-side slice — so "At risk" reflects every matching row in the database (797, not just what's on screen). The row limit (200) only caps what gets rendered; the header always reports the true match count.

- **Filters:** priority (severity), SLA status (breached / at risk / on track), category, full-text search, and show/hide resolved. They combine with AND.
- **SLA state is computed in SQL** from `age_minutes` against the per-priority target in [sla.ts](src/lib/sla.ts) — the fragment in [tickets.ts](src/lib/tickets.ts) mirrors `slaStatus()` exactly (verified: SQL and JS agree on 2,513 breached / 797 at-risk / 2,390 on-track).
- **Filters live in the URL** (`/?priority=high&sla=at-risk`), so views are shareable, bookmarkable, and survive back/forward.
- **Stat cards are shortcuts** — click "Critical & open" or "At risk of breach" to apply that filter.
- **Export CSV** (`/api/export`) downloads **every** matching row, not just the rendered page, honoring the active filters via the same query builder. Output is RFC-4180 quoted, UTF-8 with BOM (Excel-friendly), guarded against CSV-injection, and includes the derived `sla_state` and `triage_reasons`.

> 📋 **[docs/data-decisions.md](docs/data-decisions.md)** documents every
> cleanup decision, what was deliberately *not* cleaned, the invented fields
> (`age_minutes`, SLA state), and baseline figures for spotting drift. Read it
> before changing the seed script or citing a number from the app.

### Known data caveats (it's a synthetic dataset)

- The source's `First Response Time` / `Time to Resolution` are **absolute timestamps, not durations**, and are internally inconsistent (resolution precedes first-response in ~49% of closed rows). We keep them raw and derive `resolution_minutes` **only** where `resolved_at > first_response_at` (~1,400 rows). Insights labels this sample size.
- Live "age"/SLA for open tickets is **synthesized deterministically from the id** (the real timestamps are unusable as a clock) so the SLA meters still demo sensibly.
- `planTier` isn't in the CSV → imported tickets default to `starter` (one lever in the seed script).
- A handful (~7) of malformed brace tokens in descriptions can't be cleanly substituted and are left as-is.

## How it maps to the role

Every feature answers a specific line from Jordan's email:

| Jordan's problem | What the app does |
| --- | --- |
| "I spend the first 90 minutes sorting tickets by hand" | **Auto-triage** — every ticket arrives categorized and priority-scored |
| "A critical billing issue looked like a routine account question and sat 4 hours" | The engine reads the **body, not just the subject** — see ticket `TF-4471` ("Question about my account" → scored 100/100 Critical) |
| "Things still slip" | **SLA countdown** per ticket with on-track / at-risk / breached flags, and a "Smart priority" sort that floats breaches to the top |
| "I escalate to engineering / senior staff" | One-click **Escalate** on every ticket |
| "I monitor CSAT and recurring complaints" | **Insights** page: recurring-pattern alert, volume by category, CSAT trend |
| "I log resolution notes so the team can learn" | **Resolution notes** field on every ticket; recently-resolved tickets stay in the queue (toggle "Hide resolved" off) so notes are reviewable |
| Tickets arrive over chat / email / phone | **New Ticket** intake form triages each submission the instant it's logged |
| Console access | **Login screen** gates the app (demo auth, session stored in the browser) |

## How the triage engine works

`src/lib/triage.ts` scores each ticket 0–100 from its content and context, and — importantly — **returns the reasons why**, so a human can always sanity-check or override it. Signals:

- **Content keywords** — "double charged", "data loss", "cancel", "urgent", etc. raise urgency; category is inferred from the text.
- **Plan tier** — enterprise SLAs are contractual, so those tickets rank higher.
- **Channel** — phone/chat callers are waiting live.
- **Age** — tickets creep up the queue as they wait.

The score maps to a priority (critical / high / medium / low), and each priority carries an SLA first-response target (`src/lib/sla.ts`).

## Project layout

```
src/
  app/
    page.tsx            Triage queue (home) — the morning workspace
    new/page.tsx        Chat/email/phone intake form (live triage)
    insights/page.tsx   Analytics: trends, CSAT, recurring patterns
    login/page.tsx      Sign-in screen
    layout.tsx          Providers (auth + ticket store) + Shell
  components/
    Shell.tsx           Auth gate + nav chrome
    NavBar, badges, SLA meter, ticket drawer
  lib/
    triage.ts           The scoring engine (with explanations)
    sla.ts              SLA targets + breach math
    db/schema.ts        Drizzle table definition
    db/client.ts        Server-only Drizzle/libSQL client
    tickets.ts          Queue queries, SQL filters/SLA, export (server-only)
    queue-params.ts     URL search-param ↔ filter parsing
    age.ts              Deterministic synthesized ticket age
    insights.ts         Insights SQL aggregations (server-only)
    auth.tsx            Demo auth context (localStorage-backed)
    types.ts, ui.ts, format.ts
  app/actions.ts        Server actions: escalate / start / resolve / add
  app/api/export/       CSV export endpoint (respects active filters)
data/
  customer_support_tickets.csv   Source dataset (committed)
  triageflow.db                  Local SQLite DB (git-ignored, regenerable)
scripts/
  seed.ts, migrate.ts   CSV load + migrations
```

## Deploying

**GitHub Pages will not work.** Pages serves static files only, and this app
needs a Node server at request time: the queue and Insights pages are
`force-dynamic` (SQL per request), escalate/resolve/new-ticket are server
actions, and `/api/export` is an API route. `output: "export"` fails the build
outright. Deploy to a host with a Node runtime instead.

The app reads `DATABASE_URL` / `DATABASE_AUTH_TOKEN` (see [.env.example](.env.example))
and falls back to the local SQLite file, so **no code changes are needed to
deploy** — only environment variables.

### Vercel + Turso (recommended)

Vercel's filesystem is read-only and ephemeral, so the bundled `.db` file can't
accept writes. Turso is hosted libSQL — the same driver the app already uses.

```bash
# 1. Create the database (one-time; opens a browser to sign up/in)
brew install tursodatabase/tap/turso     # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create triageflow

# 2. Grab the credentials
turso db show triageflow --url           # -> DATABASE_URL
turso db tokens create triageflow        # -> DATABASE_AUTH_TOKEN

# 3. Create the schema and load the dataset into Turso
DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" npm run db:seed

# 4. Deploy (opens a browser to sign up/in; links the GitHub repo)
npm i -g vercel
vercel                                   # preview deploy
vercel env add DATABASE_URL production
vercel env add DATABASE_AUTH_TOKEN production
vercel --prod
```

The build itself never touches the database (every DB-backed page is
`force-dynamic`), so a missing env var surfaces at request time, not build time.

### Alternative: any Node host with a disk

On Render / Railway / Fly.io you can skip Turso and keep the SQLite file, as
long as you attach a **persistent volume** at `data/` — otherwise the database
resets on every deploy. Build with `npm run build`, start with `npm start`, and
run `npm run db:seed` once against the mounted volume.

## Login

The app is gated by a sign-in screen. It's **demo auth** — any valid email and any
non-empty password work, and the session is stored in the browser's
`localStorage`. No real credentials are checked or sent anywhere. Click **Use
demo credentials** to prefill `jordan@techflow.com`. Sign out from the top-right.

> This is intentionally a mock so the class demo runs with no backend. To make
> it real you'd swap `src/lib/auth.tsx` for a proper auth provider
> (NextAuth/Auth.js, Clerk, etc.) and move the gate into middleware.

## Notes for the demo

- The queue reads the highest-priority open/pending tickets from the DB (capped for a snappy UI) plus recent resolutions; the headline counts are true totals over all 8,469 rows.
- The **New Ticket** form persists a real row — try an innocuous subject with an urgent body (e.g. mention "double charged" and "cancelling") to watch the engine score it Critical.
- **Writes persist to SQLite.** Escalate / start / resolve / new-ticket all survive a refresh. Run `npm run db:seed` to reset to the clean baseline.
