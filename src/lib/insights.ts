import "server-only";
import { desc, isNotNull, sql } from "drizzle-orm";
import { db } from "./db/client";
import { tickets } from "./db/schema";

export interface Count {
  label: string;
  count: number;
}

export async function volumeByType(): Promise<Count[]> {
  const rows = await db
    .select({ label: tickets.ticketType, count: sql<number>`count(*)` })
    .from(tickets)
    .groupBy(tickets.ticketType)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
}

export async function topSubjects(limit = 8): Promise<Count[]> {
  const rows = await db
    .select({ label: tickets.ticketSubject, count: sql<number>`count(*)` })
    .from(tickets)
    .groupBy(tickets.ticketSubject)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
}

export async function channelMix(): Promise<Count[]> {
  const rows = await db
    .select({ label: tickets.ticketChannel, count: sql<number>`count(*)` })
    .from(tickets)
    .groupBy(tickets.ticketChannel)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
}

export async function priorityMix(): Promise<Count[]> {
  const rows = await db
    .select({ label: tickets.sourcePriority, count: sql<number>`count(*)` })
    .from(tickets)
    .groupBy(tickets.sourcePriority);
  const order = ["critical", "high", "medium", "low"];
  return rows
    .map((r) => ({ label: r.label, count: Number(r.count) }))
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

export interface CsatByType {
  label: string;
  avgCsat: number;
  count: number;
}

export async function csatByType(): Promise<CsatByType[]> {
  const rows = await db
    .select({
      label: tickets.ticketType,
      avg: sql<number>`avg(${tickets.customerSatisfactionRating})`,
      count: sql<number>`count(${tickets.customerSatisfactionRating})`,
    })
    .from(tickets)
    .where(isNotNull(tickets.customerSatisfactionRating))
    .groupBy(tickets.ticketType)
    .orderBy(sql`avg(${tickets.customerSatisfactionRating})`);
  return rows.map((r) => ({
    label: r.label,
    avgCsat: Number(r.avg),
    count: Number(r.count),
  }));
}

export async function csatDistribution(): Promise<Count[]> {
  const rows = await db
    .select({
      label: sql<string>`cast(${tickets.customerSatisfactionRating} as text)`,
      count: sql<number>`count(*)`,
    })
    .from(tickets)
    .where(isNotNull(tickets.customerSatisfactionRating))
    .groupBy(tickets.customerSatisfactionRating)
    .orderBy(tickets.customerSatisfactionRating);
  return rows.map((r) => ({ label: `${r.label}★`, count: Number(r.count) }));
}

export interface Headline {
  total: number;
  closed: number;
  avgCsat: number;
  csatCount: number;
  avgResolutionMinutes: number;
  resolutionSample: number;
  topSubject: string;
  topSubjectCount: number;
  worstCsatType: string;
  worstCsatValue: number;
}

export async function headline(): Promise<Headline> {
  const [agg] = await db
    .select({
      total: sql<number>`count(*)`,
      closed: sql<number>`sum(case when ${tickets.ticketStatus} = 'closed' then 1 else 0 end)`,
      avgCsat: sql<number>`avg(${tickets.customerSatisfactionRating})`,
      csatCount: sql<number>`count(${tickets.customerSatisfactionRating})`,
      avgRes: sql<number>`avg(${tickets.resolutionMinutes})`,
      resSample: sql<number>`count(${tickets.resolutionMinutes})`,
    })
    .from(tickets);

  const subjects = await topSubjects(1);
  const csat = await csatByType();
  const worst = csat[0]; // ordered ascending by avg CSAT

  return {
    total: Number(agg.total),
    closed: Number(agg.closed),
    avgCsat: Number(agg.avgCsat),
    csatCount: Number(agg.csatCount),
    avgResolutionMinutes: Number(agg.avgRes),
    resolutionSample: Number(agg.resSample),
    topSubject: subjects[0]?.label ?? "—",
    topSubjectCount: subjects[0]?.count ?? 0,
    worstCsatType: worst?.label ?? "—",
    worstCsatValue: worst?.avgCsat ?? 0,
  };
}
