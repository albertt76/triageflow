"use client";

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/types";
import { SLA_TARGET_MINUTES } from "@/lib/sla";
import { formatDuration } from "@/lib/format";
import {
  CategoryBadge,
  ChannelTag,
  PriorityBadge,
  StatusBadge,
} from "./Badges";
import { SlaMeter } from "./SlaMeter";
import { PRIORITY_STYLE } from "@/lib/ui";
import { fetchTicketDetail } from "@/app/actions";

export default function TicketDrawer({
  ticket,
  busy = false,
  onClose,
  onEscalate,
  onStart,
  onResolve,
}: {
  ticket: Ticket | null;
  busy?: boolean;
  onClose: () => void;
  onEscalate: (id: string) => void;
  onStart: (id: string) => void;
  onResolve: (id: string, note: string) => void;
}) {
  const [note, setNote] = useState("");
  // The queue list omits the wide text columns, so load them when opened.
  // Keyed by ticket id so switching tickets shows the loading state without a
  // synchronous reset in the effect.
  const [loaded, setLoaded] = useState<{ id: string; ticket: Ticket } | null>(
    null,
  );
  const ticketId = ticket?.id;
  const detail = loaded && loaded.id === ticketId ? loaded.ticket : null;

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    fetchTicketDetail(ticketId).then((d) => {
      if (cancelled || !d) return;
      // Async response from a server action — the sanctioned use of an effect.
      setLoaded({ id: ticketId, ticket: d });
      setNote(d.resolutionNote ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticket, onClose]);

  if (!ticket) return null;

  const isOpen = ticket.status !== "resolved";

  return (
    <div className="fixed inset-0 z-30">
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in">
        <div
          className={`border-l-4 ${PRIORITY_STYLE[ticket.priority].row} border-b border-slate-200 px-5 py-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">
                  {ticket.id}
                </span>
                <StatusBadge status={ticket.status} />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                {ticket.subject}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <span>{ticket.customerName}</span>
                <ChannelTag channel={ticket.channel} />
                <span>· {ticket.createdAtLabel}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <CategoryBadge category={ticket.category} />
            {ticket.assignee && (
              <span className="text-xs text-slate-500">
                → {ticket.assignee}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              SLA — {formatDuration(SLA_TARGET_MINUTES[ticket.priority])} target
            </h3>
            <SlaMeter priority={ticket.priority} ageMinutes={ticket.ageMinutes} />
          </section>

          <section className="rounded-lg bg-slate-50 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Why the engine flagged this
            </h3>
            <div className="mb-2 text-sm text-slate-600">
              Triage score{" "}
              <span className="font-semibold text-slate-900">
                {ticket.score}
              </span>{" "}
              / 100
            </div>
            <ul className="space-y-1">
              {ticket.reasons.map((reason, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-600"
                >
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Customer message
            </h3>
            {detail ? (
              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
                {detail.body}
              </p>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            )}
          </section>

          {/* Every remaining field from the source record. */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ticket details
            </h3>
            {detail ? (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:grid-cols-2">
                <Row label="Customer" value={detail.customerName} />
                <Row label="Email" value={detail.customerEmail} />
                <Row label="Age" value={detail.customerAge} />
                <Row label="Gender" value={detail.customerGender} />
                <Row label="Product" value={detail.productPurchased} />
                <Row label="Purchased" value={detail.dateOfPurchase} />
                <Row label="Ticket type" value={detail.ticketType} />
                <Row label="Channel" value={detail.channel} capitalize />
                <Row label="Status" value={detail.status} />
                <Row
                  label="Priority (customer)"
                  value={detail.sourcePriority}
                  capitalize
                />
                <Row
                  label="Priority (engine)"
                  value={`${detail.priority} · score ${detail.score}/100`}
                  capitalize
                />
                <Row label="Category (engine)" value={detail.category} />
                <Row label="Created" value={formatIso(detail.createdAtIso)} />
                <Row
                  label="First response"
                  value={formatIso(detail.firstResponseAtIso)}
                />
                <Row label="Resolved" value={formatIso(detail.resolvedAtIso)} />
                <Row
                  label="Time to resolve"
                  value={
                    detail.resolutionMinutes != null
                      ? formatDuration(detail.resolutionMinutes)
                      : null
                  }
                />
                <Row
                  label="Satisfaction"
                  value={detail.csat != null ? `${detail.csat} / 5` : null}
                />
                <Row label="Assignee" value={detail.assignee} />
              </dl>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Resolution notes
            </h3>
            {ticket.status === "resolved" ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {detail ? detail.resolutionNote || "Resolved." : "Loading…"}
              </p>
            ) : (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Log what you did so the team can learn from it…"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            )}
          </section>
        </div>

        {isOpen && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4">
            {ticket.status === "new" && (
              <button
                disabled={busy}
                onClick={() => onStart(ticket.id)}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Start working
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => onEscalate(ticket.id)}
              className="rounded-md border border-fuchsia-300 bg-fuchsia-50 px-3 py-2 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-100 disabled:opacity-50"
            >
              Escalate to engineering
            </button>
            <button
              disabled={busy}
              onClick={() => onResolve(ticket.id, note.trim() || "Resolved.")}
              className="ml-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Mark resolved
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

/** One definition-list entry; renders an em-dash when the value is absent. */
function Row({
  label,
  value,
  capitalize,
}: {
  label: string;
  value?: string | number | null;
  capitalize?: boolean;
}) {
  const empty = value == null || value === "";
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd
        className={`text-sm ${empty ? "text-slate-300" : "text-slate-700"} ${
          capitalize ? "capitalize" : ""
        } break-words`}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}

/** "2026-07-29T18:36Z" → "Jul 29, 2026, 2:36 PM" (local). */
function formatIso(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
