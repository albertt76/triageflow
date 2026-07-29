"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Channel, Gender, Priority, Ticket } from "@/lib/types";
import { PriorityBadge, CategoryBadge } from "@/components/Badges";
import { SlaMeter } from "@/components/SlaMeter";
import { SLA_TARGET_MINUTES } from "@/lib/sla";
import { formatDuration } from "@/lib/format";
import { addTicket } from "@/app/actions";

const CHANNELS: Channel[] = ["chat", "email", "phone", "social"];
const GENDERS: Gender[] = ["Male", "Female", "Other"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

export default function NewTicketForm({
  products,
  ticketTypes,
}: {
  products: string[];
  ticketTypes: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAge, setCustomerAge] = useState("");
  const [customerGender, setCustomerGender] = useState<Gender | "">("");
  // Product
  const [productPurchased, setProductPurchased] = useState(products[0] ?? "");
  const [dateOfPurchase, setDateOfPurchase] = useState("");
  // Ticket
  const [ticketType, setTicketType] = useState(ticketTypes[0] ?? "");
  const [channel, setChannel] = useState<Channel>("chat");
  const [sourcePriority, setSourcePriority] = useState<Priority>("medium");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [created, setCreated] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());
  const canSubmit =
    customerName.trim() &&
    emailValid &&
    productPurchased &&
    ticketType &&
    subject.trim() &&
    body.trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError(
        !emailValid
          ? "Enter a valid customer email."
          : "Fill in every required field.",
      );
      return;
    }
    setError(null);
    const age = customerAge.trim() ? Number(customerAge) : null;
    startTransition(async () => {
      const ticket = await addTicket({
        customerName,
        customerEmail,
        customerAge: Number.isFinite(age) ? age : null,
        customerGender: customerGender || null,
        productPurchased,
        dateOfPurchase: dateOfPurchase || null,
        ticketType,
        subject,
        body,
        channel,
        sourcePriority,
      });
      setCreated(ticket);
      router.refresh();
    });
  };

  const reset = () => {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerAge("");
    setCustomerGender("");
    setProductPurchased(products[0] ?? "");
    setDateOfPurchase("");
    setTicketType(ticketTypes[0] ?? "");
    setChannel("chat");
    setSourcePriority("medium");
    setSubject("");
    setBody("");
    setCreated(null);
    setError(null);
  };

  if (created) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Header />
        <TriageResult ticket={created} onReset={reset} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Header />
      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <Section title="Customer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Alicia Reyes"
                className="input"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="name@example.com"
                className="input"
              />
            </Field>
            <Field label="Age">
              <input
                type="number"
                min={0}
                max={120}
                value={customerAge}
                onChange={(e) => setCustomerAge(e.target.value)}
                placeholder="optional"
                className="input"
              />
            </Field>
            <Field label="Gender">
              <select
                value={customerGender}
                onChange={(e) =>
                  setCustomerGender(e.target.value as Gender | "")
                }
                className="input"
              >
                <option value="">Not specified</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Product">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product purchased" required>
              <select
                value={productPurchased}
                onChange={(e) => setProductPurchased(e.target.value)}
                className="input"
              >
                {products.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date of purchase">
              <input
                type="date"
                value={dateOfPurchase}
                onChange={(e) => setDateOfPurchase(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </Section>

        <Section title="Ticket">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" required>
              <select
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value)}
                className="input"
              >
                {ticketTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority stated by customer">
              <select
                value={sourcePriority}
                onChange={(e) =>
                  setSourcePriority(e.target.value as Priority)
                }
                className="input capitalize"
              >
                {PRIORITIES.map((p) => (
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

          <Field label="Subject" required>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary of the issue"
              className="input"
            />
          </Field>

          <Field label="Description" required>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Paste or type what the customer said…"
              className="input resize-y"
            />
          </Field>
        </Section>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-400">
            The engine scores the subject and description — try words like
            &ldquo;double charged&rdquo; or &ldquo;urgent&rdquo;.
          </p>
          <button
            type="submit"
            disabled={!canSubmit || isPending}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Triaging…" : "Triage & add to queue"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">New ticket</h1>
      <p className="mt-1 text-sm text-slate-600">
        Log an incoming chat, email, phone or social conversation. The triage
        engine scores it the moment you submit — no manual sorting.
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </legend>
      {children}
    </fieldset>
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

        {ticket.sourcePriority && ticket.sourcePriority !== ticket.priority && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The customer called this{" "}
            <span className="font-semibold capitalize">
              {ticket.sourcePriority}
            </span>
            ; the engine scored it{" "}
            <span className="font-semibold capitalize">{ticket.priority}</span>.
            Both are recorded.
          </p>
        )}

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
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
