"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { triage } from "@/lib/triage";
import {
  rowToTicket,
  parseTicketId,
  getTicket,
  QUEUE_COUNTS_TAG,
} from "@/lib/tickets";
import { slaDeadlines } from "@/lib/sla";
import type { Channel, Gender, Priority, Ticket } from "@/lib/types";

/**
 * Load the wide text fields the queue list deliberately skips. Called when the
 * drawer opens — one small single-row query instead of shipping every
 * description with the list.
 */
export async function fetchTicketDetail(appId: string): Promise<Ticket | null> {
  return getTicket(parseTicketId(appId));
}

export async function escalateTicket(appId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ assignee: "Engineering" })
    .where(eq(tickets.id, parseTicketId(appId)));
  updateTag(QUEUE_COUNTS_TAG);
  revalidatePath("/");
}

export async function startTicket(appId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ ticketStatus: "pending" })
    .where(eq(tickets.id, parseTicketId(appId)));
  updateTag(QUEUE_COUNTS_TAG);
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
  // How long the ticket actually took, measured from when it was created.
  const resolutionMinutes = row
    ? Math.max(1, Math.round((now - row.createdAt) / 60000))
    : null;

  await db
    .update(tickets)
    .set({
      ticketStatus: "closed",
      resolution: note,
      resolvedAt: now,
      customerSatisfactionRating: csat ?? null,
      resolutionMinutes,
    })
    .where(eq(tickets.id, id));
  updateTag(QUEUE_COUNTS_TAG);
  revalidatePath("/");
}

/**
 * Everything an agent records when logging a ticket. Mirrors the source CSV's
 * columns, minus the ones that only exist after the fact (status, resolution,
 * CSAT, response/resolution timestamps) and the auto-assigned id.
 */
export interface NewTicketInput {
  customerName: string;
  customerEmail: string;
  customerAge?: number | null;
  customerGender?: Gender | null;
  productPurchased: string;
  dateOfPurchase?: string | null;
  ticketType: string;
  subject: string;
  body: string;
  channel: Channel;
  /** What the customer says the urgency is — kept apart from the engine's. */
  sourcePriority: Priority;
}

/** Triage and insert a new ticket; returns the created (scored) app ticket. */
export async function addTicket(input: NewTicketInput): Promise<Ticket> {
  const t = triage({
    subject: input.subject,
    body: input.body,
    channel: input.channel,
    ageMinutes: 0,
  });

  const [{ maxId }] = await db
    .select({ maxId: sql<number>`coalesce(max(${tickets.id}), 0)` })
    .from(tickets);
  const id = Number(maxId) + 1;
  const now = Date.now();
  const deadlines = slaDeadlines(t.priority, now);

  const [row] = await db
    .insert(tickets)
    .values({
      id,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      customerAge: input.customerAge ?? null,
      customerGender: input.customerGender ?? null,
      productPurchased: input.productPurchased,
      dateOfPurchase: input.dateOfPurchase?.trim() || null,
      ticketType: input.ticketType,
      ticketSubject: input.subject.trim(),
      ticketDescription: input.body.trim(),
      ticketStatus: "open",
      // The customer's claim, preserved alongside the engine's verdict below.
      sourcePriority: input.sourcePriority,
      ticketChannel: input.channel,
      createdAt: now, // brand new — the SLA clock starts now
      atRiskAt: deadlines.atRiskAt,
      breachAt: deadlines.breachAt,
      triagePriority: t.priority,
      triageScore: t.score,
      triageCategory: t.category,
      triageReasons: t.reasons,
    })
    .returning();

  updateTag(QUEUE_COUNTS_TAG);
  revalidatePath("/");
  return rowToTicket(row);
}
