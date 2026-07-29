import { readFileSync, mkdirSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { tickets, type NewTicketRow } from "../src/lib/db/schema";
import { triage } from "../src/lib/triage";
import { syntheticCreatedAt } from "../src/lib/age";
import type { Channel } from "../src/lib/types";

// The dataset ships with the repo so the project is clone-and-run. Override
// with CSV_PATH=… to seed from a different export.
const CSV_PATH =
  process.env.CSV_PATH ?? "./data/customer_support_tickets.csv";
const url = process.env.DATABASE_URL ?? "file:./data/triageflow.db";

if (url.startsWith("file:")) {
  try {
    mkdirSync("./data", { recursive: true });
  } catch {
    /* exists */
  }
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client, { schema: { tickets } });

// --- helpers ----------------------------------------------------------------
const STATUS_MAP: Record<string, "open" | "pending" | "closed"> = {
  Open: "open",
  "Pending Customer Response": "pending",
  Closed: "closed",
};

const CHANNEL_MAP: Record<string, Channel> = {
  Email: "email",
  Phone: "phone",
  Chat: "chat",
  "Social media": "social",
};

function blank(v: string | undefined): boolean {
  return v == null || v.trim() === "";
}

function toEpochMs(v: string | undefined): number | null {
  if (blank(v)) return null;
  const t = new Date(v!.trim().replace(" ", "T")).getTime();
  return Number.isFinite(t) ? t : null;
}

function priorityLower(v: string): "low" | "medium" | "high" | "critical" {
  const p = v.trim().toLowerCase();
  if (p === "low" || p === "medium" || p === "high" || p === "critical")
    return p;
  return "medium";
}

// --- load & transform -------------------------------------------------------
const raw = readFileSync(CSV_PATH, "utf-8");
const records: Record<string, string>[] = parse(raw, {
  columns: true,
  skip_empty_lines: true,
});

console.log(`Parsed ${records.length} rows from ${CSV_PATH}`);

// Single anchor instant for the whole run, so every row is rebased against the
// same "now" rather than drifting across the loop.
const SEED_NOW = Date.now();

const rows: NewTicketRow[] = records.map((r) => {
  const product = r["Product Purchased"];
  // Substitute unrendered Faker placeholders with the real product name. The
  // source is messy — casing varies and some tokens carry suffixes
  // ({product_purchased_id}, {product_purchased_url}) — so replace any
  // brace-delimited token mentioning product_purchased. Brace-less corruptions
  // ("the product_purchased attribute") are left as-is to avoid false hits.
  const description = (r["Ticket Description"] ?? "").replace(
    /\{[^{}]*product_purchased[^{}]*\}/gi,
    product,
  );
  const channel = CHANNEL_MAP[r["Ticket Channel"]] ?? "email";
  const status = STATUS_MAP[r["Ticket Status"]] ?? "open";

  const firstResponseAt = toEpochMs(r["First Response Time"]);
  const resolvedAt = toEpochMs(r["Time to Resolution"]);
  // Only trust a duration when the timestamps are internally consistent.
  const resolutionMinutes =
    firstResponseAt != null && resolvedAt != null && resolvedAt > firstResponseAt
      ? Math.round((resolvedAt - firstResponseAt) / 60000)
      : null;

  // Materialize the triage engine's output. planTier is absent in the CSV, so
  // default everyone to "starter" (documented assumption).
  const t = triage({
    subject: r["Ticket Subject"],
    body: description,
    channel,
    planTier: "starter",
  });

  const csatRaw = r["Customer Satisfaction Rating"];
  const id = Number(r["Ticket ID"]);

  return {
    id,
    customerName: r["Customer Name"],
    customerEmail: r["Customer Email"],
    customerAge: blank(r["Customer Age"]) ? null : Number(r["Customer Age"]),
    customerGender: (blank(r["Customer Gender"])
      ? null
      : r["Customer Gender"]) as NewTicketRow["customerGender"],
    productPurchased: product,
    dateOfPurchase: blank(r["Date of Purchase"]) ? null : r["Date of Purchase"],
    ticketType: r["Ticket Type"],
    ticketSubject: r["Ticket Subject"],
    ticketDescription: description,
    ticketStatus: status,
    resolution: blank(r["Resolution"]) ? null : r["Resolution"],
    sourcePriority: priorityLower(r["Ticket Priority"]),
    ticketChannel: channel,
    firstResponseAt,
    resolvedAt,
    customerSatisfactionRating: blank(csatRaw) ? null : Math.round(Number(csatRaw)),
    triagePriority: t.priority,
    triageScore: t.score,
    triageCategory: t.category,
    triageReasons: t.reasons,
    resolutionMinutes,
    // Rebase onto a window ending at SEED_NOW. Age is derived live from this,
    // so the SLA clock keeps ticking after the seed run.
    createdAt: syntheticCreatedAt(id, t.priority, status === "closed", SEED_NOW),
  };
});

// --- write ------------------------------------------------------------------
async function main() {
  // Ensure the schema exists before we load.
  await migrate(db, { migrationsFolder: "./drizzle" });

  await db.delete(tickets); // idempotent re-seed

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(tickets).values(rows.slice(i, i + BATCH));
    process.stdout.write(
      `\rInserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`,
    );
  }
  process.stdout.write("\n");

  const [{ n }] = (await client.execute("SELECT count(*) as n FROM tickets"))
    .rows as unknown as { n: number }[];
  console.log(`✓ Seed complete — ${n} tickets in the database`);

  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
