import { NextRequest } from "next/server";
import { getTicketsForExport, ageMinutesOf } from "@/lib/tickets";
import { parseQueueFilters } from "@/lib/queue-params";
import { slaStatus } from "@/lib/sla";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "ticket_id",
  "subject",
  "customer_name",
  "customer_email",
  "product_purchased",
  "channel",
  "status",
  "source_priority",
  "triage_priority",
  "triage_score",
  "triage_category",
  "triage_reasons",
  "sla_state",
  "created_at",
  "age_minutes",
  "resolution_minutes",
  "csat",
  "assignee",
  "resolution",
] as const;

/** RFC-4180 escaping: wrap in quotes and double any embedded quotes. */
function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // Guard against CSV injection when opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseQueueFilters(params);
  const rows = await getTicketsForExport(filters);

  const now = Date.now();
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    const resolved = r.ticketStatus === "closed";
    const ageMinutes = resolved
      ? (r.resolutionMinutes ?? 0)
      : ageMinutesOf(r, now);
    const sla = resolved
      ? ""
      : slaStatus(r.triagePriority, ageMinutes).state;
    lines.push(
      [
        r.id,
        r.ticketSubject,
        r.customerName,
        r.customerEmail,
        r.productPurchased,
        r.ticketChannel,
        r.ticketStatus,
        r.sourcePriority,
        r.triagePriority,
        r.triageScore,
        r.triageCategory,
        (r.triageReasons ?? []).join("; "),
        sla,
        new Date(r.createdAt).toISOString(),
        ageMinutes,
        r.resolutionMinutes,
        r.customerSatisfactionRating,
        r.assignee,
        r.resolution,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // BOM so Excel detects UTF-8 correctly.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="triageflow-tickets-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
