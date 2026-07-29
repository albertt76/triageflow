"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Channel, PlanTier, Ticket } from "@/lib/types";
import { PriorityBadge, CategoryBadge } from "@/components/Badges";
import { SlaMeter } from "@/components/SlaMeter";
import { SLA_TARGET_MINUTES } from "@/lib/sla";
import { formatDuration } from "@/lib/format";
import { addTicket } from "@/app/actions";

const PLANS: PlanTier[] = ["free", "starter", "pro", "enterprise"];
const CHANNELS: Channel[] = ["chat", "email", "phone", "social"];

export default function NewTicketPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [customerName, setCustomerName] = useState("");
  const [planTier, setPlanTier] = useState<PlanTier>("pro");
  const [channel, setChannel] = useState<Channel>("chat");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [created, setCreated] = useState<Ticket | null>(null);

  const canSubmit = customerName.trim() && subject.trim() && body.trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      const ticket = await addTicket({
        customerName: customerName.trim(),
        planTier,
        channel,
        subject: subject.trim(),
        body: body.trim(),
      });
      setCreated(ticket);
      router.refresh();
    });
  };

  const reset = () => {
    setCustomerName("");
    setPlanTier("pro");
    setChannel("chat");
    setSubject("");
    setBody("");
    setCreated(null);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New ticket</h1>
        <p className="mt-1 text-sm text-slate-600">
          Log an incoming chat, email, or phone conversation. The triage engine
          scores it the moment you submit — no manual sorting.
        </p>
      </div>

      {created ? (
        <TriageResult ticket={created} onReset={reset} />
      ) : (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Alicia Reyes"
                className="input"
              />
            </Field>
            <Field label="Plan tier">
              <select
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value as PlanTier)}
                className="input capitalize"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Channel">
            <div className="flex gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                    channel === c
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary of the issue"
              className="input"
            />
          </Field>

          <Field label="Message">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Paste or type what the customer said…"
              className="input resize-y"
            />
          </Field>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-400">
              Tip: try words like &ldquo;double charged&rdquo; or
              &ldquo;urgent&rdquo; to see the score change.
            </p>
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Triaging…" : "Triage & add to queue"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TriageResult({
  ticket,
  onReset,
}: {
  ticket: Ticket;
  onReset: () => void;
}) {
  return (
    <div className="animate-in space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <span aria-hidden>✓</span> Ticket {ticket.id} added to the queue
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          How the engine triaged it
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <CategoryBadge category={ticket.category} />
          <span className="text-sm text-slate-500">
            score{" "}
            <span className="font-semibold text-slate-900">{ticket.score}</span>
            /100
          </span>
        </div>

        <div className="mb-4">
          <div className="mb-1 text-xs text-slate-500">
            SLA target — first response within{" "}
            {formatDuration(SLA_TARGET_MINUTES[ticket.priority])}
          </div>
          <SlaMeter priority={ticket.priority} ageMinutes={0} />
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Why
        </h3>
        <ul className="space-y-1">
          {ticket.reasons.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-slate-600"
            >
              <span className="mt-0.5 text-slate-400">•</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <Link
          href="/"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          View in queue
        </Link>
        <button
          onClick={onReset}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Log another ticket
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
