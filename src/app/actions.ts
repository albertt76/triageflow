"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { triage } from "@/lib/triage";
import { rowToTicket, parseTicketId } from "@/lib/tickets";
import type { Channel, PlanTier, Ticket } from "@/lib/types";

export async function escalateTicket(appId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ assignee: "Engineering" })
    .where(eq(tickets.id, parseTicketId(appId)));
  revalidatePath("/");
}

export async function startTicket(appId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ ticketStatus: "pending" })
    .where(eq(tickets.id, parseTicketId(appId)));
  revalidatePath("/");
}

export async function resolveTicket(
  appId: string,
  note: string,
  csat?: number,
): Promise<void> {
  const id = parseTicketId(appId);
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id));
  const now = Date.now();
  const resolutionMinutes =
    row?.firstResponseAt != null
      ? Math.max(1, Math.round((now - row.firstResponseAt) / 60000))
      : null;

  await db
    .update(tickets)
    .set({
      ticketStatus: "closed",
      resolution: note,
      resolvedAt: now,
      customerSatisfactionRating: csat ?? null,
      resolutionMinutes,
      ...(resolutionMinutes != null ? { ageMinutes: resolutionMinutes } : {}),
    })
    .where(eq(tickets.id, id));
  revalidatePath("/");
}

export interface NewTicketInput {
  subject: string;
  body: string;
  customerName: string;
  planTier: PlanTier;
  channel: Channel;
}

/** Triage and insert a new ticket; returns the created (scored) app ticket. */
export async function addTicket(input: NewTicketInput): Promise<Ticket> {
  const t = triage({
    subject: input.subject,
    body: input.body,
    channel: input.channel,
    planTier: input.planTier,
    ageMinutes: 0,
  });

  const [{ maxId }] = await db
    .select({ maxId: sql<number>`coalesce(max(${tickets.id}), 0)` })
    .from(tickets);
  const id = Number(maxId) + 1;

  const [row] = await db
    .insert(tickets)
    .values({
      id,
      customerName: input.customerName,
      customerEmail: "unknown@triageflow.local",
      productPurchased: "—",
      ticketType: "Technical issue",
      ticketSubject: input.subject,
      ticketDescription: input.body,
      ticketStatus: "open",
      sourcePriority: t.priority,
      ticketChannel: input.channel,
      ageMinutes: 0, // brand new — the SLA clock starts now
      triagePriority: t.priority,
      triageScore: t.score,
      triageCategory: t.category,
      triageReasons: t.reasons,
    })
    .returning();

  revalidatePath("/");
  return rowToTicket(row);
}
