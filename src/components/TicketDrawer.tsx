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

  // Reset the note field when a different ticket is opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote(ticket?.resolutionNote ?? "");
  }, [ticket?.id, ticket?.resolutionNote]);

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
                <span className="capitalize">· {ticket.planTier} plan</span>
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
            <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
              {ticket.body}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Resolution notes
            </h3>
            {ticket.status === "resolved" ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {ticket.resolutionNote || "Resolved."}
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
