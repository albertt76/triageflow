"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type SlaState } from "@/lib/sla";
import type { Category, Channel, Priority, Ticket } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import {
  CategoryBadge,
  ChannelTag,
  PriorityBadge,
  StatusBadge,
} from "@/components/Badges";
import { SlaMeter, SlaBadge } from "@/components/SlaMeter";
import TicketDrawer from "@/components/TicketDrawer";
import { PRIORITY_STYLE, CATEGORY_LABEL } from "@/lib/ui";
import type {
  QueueCounts,
  QueueFilters,
  SearchField,
  SortKey,
  StatusFilter,
} from "@/lib/tickets";

const CHANNEL_OPTIONS: Channel[] = ["email", "phone", "chat", "social"];

/**
 * Secondary filters that live behind the "＋ Filter" menu rather than sitting in
 * the bar: field-targeted search plus the investigative drill-downs (category /
 * channel / product). None are part of the every-session triage loop.
 */
type ExtraKey = "search" | "category" | "channel" | "product";
const EXTRA_KEYS: ExtraKey[] = ["search", "category", "channel", "product"];
const EXTRA_LABEL: Record<ExtraKey, string> = {
  search: "Search",
  category: "Category",
  channel: "Channel",
  product: "Product",
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "unresolved", label: "Open & in progress" },
  { value: "new", label: "New only" },
  { value: "in-progress", label: "In progress only" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All statuses" },
];

const SEARCH_FIELD_OPTIONS: {
  value: SearchField;
  label: string;
  placeholder: string;
}[] = [
  { value: "subject", label: "Subject", placeholder: "Search subject…" },
  {
    value: "customer",
    label: "Customer name",
    placeholder: "Search customer name…",
  },
  { value: "email", label: "Email", placeholder: "Search email…" },
  { value: "id", label: "ID", placeholder: "e.g. 1349 or TF-1349" },
];
import { filtersToQuery } from "@/lib/queue-params";
import {
  escalateTicket,
  startTicket,
  resolveTicket,
  assignTicket,
} from "@/app/actions";
import { TEAM } from "@/lib/team";

export default function QueueView({
  tickets,
  counts,
  filters,
  matched,
  shown,
  limit,
  products,
}: {
  tickets: Ticket[];
  counts: QueueCounts;
  filters: QueueFilters;
  matched: number;
  shown: number;
  limit: number;
  products: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Local mirror of the search box so typing stays responsive; committed to the
  // URL (and therefore the SQL query) after a short debounce.
  const [queryInput, setQueryInput] = useState(filters.query ?? "");
  // "＋ Filter" state: which extra filters the user has revealed but not yet set
  // a value for, and whether the add menu is open.
  const [revealed, setRevealed] = useState<Set<ExtraKey>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const openTotal = counts.open + counts.pending;

  /** Push new filters into the URL — the server re-queries the whole table. */
  const applyFilters = (next: Partial<QueueFilters>) => {
    const merged = { ...filters, ...next };
    const qs = filtersToQuery(merged);
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  // Keep the box in sync when the URL changes from elsewhere (e.g. "Clear").
  // Deriving during render is the recommended alternative to a sync effect.
  const [lastUrlQuery, setLastUrlQuery] = useState(filters.query ?? "");
  if ((filters.query ?? "") !== lastUrlQuery) {
    setLastUrlQuery(filters.query ?? "");
    setQueryInput(filters.query ?? "");
  }

  // Debounce the search input into the URL.
  useEffect(() => {
    if (queryInput === (filters.query ?? "")) return;
    const id = setTimeout(() => applyFilters({ query: queryInput }), 350);
    return () => clearTimeout(id);
    // applyFilters/filters are stable enough here; re-running on every filter
    // change would cancel the debounce mid-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const filtersActive =
    filters.priority !== "all" ||
    filters.sla !== "all" ||
    filters.category !== "all" ||
    filters.channel !== "all" ||
    filters.product !== "all" ||
    filters.status !== "unresolved" ||
    filters.assignment !== "all" ||
    Boolean(filters.query?.trim());

  const exportHref = (() => {
    const qs = filtersToQuery(filters);
    return qs ? `/api/export?${qs}` : "/api/export";
  })();

  const searchField = filters.searchField ?? "subject";
  const activeSearchOption =
    SEARCH_FIELD_OPTIONS.find((f) => f.value === searchField) ??
    SEARCH_FIELD_OPTIONS[0];

  const categoryOptions: (Category | "all")[] = [
    "all",
    "outage",
    "billing",
    "technical",
    "account",
    "how-to",
    "feature-request",
  ];
  const priorityOptions: { value: Priority | "all"; label: string }[] = [
    { value: "all", label: "All priorities" },
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];
  const slaOptions: { value: SlaState | "all"; label: string }[] = [
    { value: "all", label: "Any SLA status" },
    { value: "breached", label: "SLA breached" },
    { value: "at-risk", label: "At risk" },
    { value: "on-track", label: "On track" },
  ];

  // An extra filter is "active" once it has a real value; a chip is shown when
  // it's active OR the user just revealed it from the ＋ Filter menu.
  const isExtraActive = (k: ExtraKey) =>
    k === "search"
      ? Boolean(filters.query?.trim())
      : (filters[k] ?? "all") !== "all";
  const shownExtras = EXTRA_KEYS.filter(
    (k) => isExtraActive(k) || revealed.has(k),
  );
  const addableExtras = EXTRA_KEYS.filter((k) => !shownExtras.includes(k));
  const activeExtraCount = EXTRA_KEYS.filter(isExtraActive).length;

  const addExtra = (k: ExtraKey) => {
    setRevealed((prev) => new Set(prev).add(k));
    setAddOpen(false);
  };
  const removeExtra = (k: ExtraKey) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    if (k === "search") {
      setQueryInput("");
      applyFilters({ query: "", searchField: "subject" });
    } else {
      applyFilters({ [k]: "all" });
    }
  };

  const clearAllFilters = () => {
    setRevealed(new Set());
    setQueryInput("");
    applyFilters({
      priority: "all",
      sla: "all",
      category: "all",
      channel: "all",
      product: "all",
      query: "",
      searchField: "subject",
      status: "unresolved",
      assignment: "all",
    });
  };

  /** The value dropdown for one extra filter, rendered inside its chip. */
  const extraSelect = (k: ExtraKey) => {
    const cls =
      "border-0 bg-transparent py-0.5 pr-6 text-sm text-slate-800 outline-none focus:ring-0";
    if (k === "category")
      return (
        <select
          value={filters.category}
          onChange={(e) =>
            applyFilters({ category: e.target.value as Category | "all" })
          }
          aria-label="Filter by category"
          className={cls}
        >
          <option value="all">Any category</option>
          {categoryOptions
            .filter((c) => c !== "all")
            .map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c as Category]}
              </option>
            ))}
        </select>
      );
    if (k === "channel")
      return (
        <select
          value={filters.channel}
          onChange={(e) =>
            applyFilters({ channel: e.target.value as Channel | "all" })
          }
          aria-label="Filter by channel"
          className={`${cls} capitalize`}
        >
          <option value="all">Any channel</option>
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </select>
      );
    return (
      <select
        value={filters.product}
        onChange={(e) => applyFilters({ product: e.target.value })}
        aria-label="Filter by product"
        className={`${cls} max-w-[160px]`}
      >
        <option value="all">Any product</option>
        {products.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    );
  };

  /** A single active-filter chip. Search gets a field selector + text box; the
   *  others are a labelled value dropdown. */
  const renderChip = (k: ExtraKey) => {
    if (k === "search")
      return (
        <div
          key="search"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white"
        >
          <select
            value={searchField}
            onChange={(e) =>
              applyFilters({ searchField: e.target.value as SearchField })
            }
            aria-label="Field to search"
            className="rounded-l-md border-r border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-700 outline-none"
          >
            {SEARCH_FIELD_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            inputMode={searchField === "id" ? "numeric" : undefined}
            placeholder={activeSearchOption.placeholder}
            aria-label={`Search by ${activeSearchOption.label}`}
            className="w-44 min-w-0 px-2 py-1.5 text-sm outline-none"
          />
          <button
            onClick={() => removeExtra("search")}
            aria-label="Remove Search filter"
            className="mr-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      );
    return (
      <div
        key={k}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white py-1 pl-2.5 pr-1"
      >
        <span className="text-xs font-medium text-slate-500">
          {EXTRA_LABEL[k]}
        </span>
        {extraSelect(k)}
        <button
          onClick={() => removeExtra(k)}
          aria-label={`Remove ${EXTRA_LABEL[k]} filter`}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Good morning, Jordan
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {openTotal.toLocaleString()} open tickets triaged automatically from{" "}
          {counts.total.toLocaleString()} in the database.{" "}
          {counts.needAttention > 0 ? (
            <span className="font-medium text-red-600">
              {counts.needAttention} critical need attention right now.
            </span>
          ) : (
            <span className="font-medium text-emerald-600">
              Nothing critical is open — you&apos;re ahead of the queue.
            </span>
          )}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Open in queue"
          value={openTotal.toLocaleString()}
          tone="slate"
        />
        <StatCard
          label="Critical & open"
          value={counts.needAttention.toLocaleString()}
          tone="red"
          active={filters.priority === "critical"}
          onClick={() =>
            applyFilters({
              priority: "critical",
              sla: "all",
              status: "unresolved",
            })
          }
        />
        <StatCard
          label="At risk of breach"
          value={counts.atRisk.toLocaleString()}
          tone="amber"
          active={filters.sla === "at-risk"}
          onClick={() =>
            applyFilters({
              sla: "at-risk",
              priority: "all",
              status: "unresolved",
            })
          }
        />
        <StatCard
          label="Resolved (total)"
          value={counts.closed.toLocaleString()}
          tone="slate"
        />
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.priority}
          onChange={(e) =>
            applyFilters({ priority: e.target.value as Priority | "all" })
          }
          aria-label="Filter by priority"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          {priorityOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={filters.sla}
          onChange={(e) =>
            applyFilters({ sla: e.target.value as SlaState | "all" })
          }
          aria-label="Filter by SLA status"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          {slaOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            applyFilters({ status: e.target.value as StatusFilter })
          }
          aria-label="Filter by status"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filters.assignment}
          onChange={(e) => applyFilters({ assignment: e.target.value })}
          aria-label="Filter by assignment"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="all">Anyone</option>
          <option value="assigned">Assigned</option>
          <option value="unassigned">Unassigned</option>
          {TEAM.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Secondary filters (category / channel / product) live behind this
            menu so the bar stays short. Picking one reveals a chip below. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800"
          >
            <span aria-hidden>+</span> Filter
            {activeExtraCount > 0 && (
              <span className="ml-0.5 rounded-full bg-slate-900 px-1.5 text-xs font-semibold text-white">
                {activeExtraCount}
              </span>
            )}
          </button>
          {addOpen && (
            <>
              {/* Backdrop closes the menu on outside click. */}
              <button
                aria-hidden
                tabIndex={-1}
                onClick={() => setAddOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                role="menu"
                className="absolute left-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
              >
                {addableExtras.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-slate-400">
                    All filters added
                  </div>
                ) : (
                  addableExtras.map((k) => (
                    <button
                      key={k}
                      role="menuitem"
                      onClick={() => addExtra(k)}
                      className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      {EXTRA_LABEL[k]}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <select
          value={filters.sort}
          onChange={(e) => applyFilters({ sort: e.target.value as SortKey })}
          aria-label="Sort"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="smart">Smart priority</option>
          <option value="sla">SLA deadline</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        {filtersActive && (
          <button
            onClick={clearAllFilters}
            className="rounded-md px-2 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        )}
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          title="Download the filtered tickets as CSV"
        >
          <span aria-hidden>⬇</span> Export CSV
        </a>
        </div>

        {/* Active secondary filters as removable chips. */}
        {shownExtras.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {shownExtras.map((k) => renderChip(k))}
          </div>
        )}
      </div>

      {/* Result summary — makes it explicit that filters hit the whole table */}
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {matched.toLocaleString()}{" "}
          {matched === 1 ? "ticket matches" : "tickets match"}
          {filtersActive ? " these filters" : ""}
          {matched > shown && (
            <> · showing the top {shown.toLocaleString()}</>
          )}
        </span>
        {isPending && <span className="text-slate-400">Updating…</span>}
      </div>

      <div
        className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {tickets.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No tickets match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                onOpen={() => setSelectedId(t.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Filters and sorting run in SQL across all{" "}
        {counts.total.toLocaleString()} tickets; the list renders up to {limit}{" "}
        at a time. Export CSV downloads every matching row.
      </p>

      <TicketDrawer
        ticket={selected}
        busy={isPending}
        onClose={() => setSelectedId(null)}
        onEscalate={(id) => run(() => escalateTicket(id))}
        onStart={(id) => run(() => startTicket(id))}
        onResolve={(id, note) => {
          run(() => resolveTicket(id, note, 5));
          setSelectedId(null);
        }}
        onAssign={(id, assignee) => run(() => assignTicket(id, assignee))}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  tone: "slate" | "red" | "amber";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneStyle = {
    slate: "text-slate-900",
    red: "text-red-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
        active ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
      } ${onClick ? "hover:border-slate-300 hover:shadow" : "cursor-default"}`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneStyle}`}>{value}</div>
    </button>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const isResolved = ticket.status === "resolved";
  return (
    <li>
      <button
        onClick={onOpen}
        className={`flex w-full items-center gap-4 border-l-4 ${
          PRIORITY_STYLE[ticket.priority].row
        } px-4 py-3 text-left transition hover:bg-slate-50 ${
          isResolved ? "opacity-60" : ""
        }`}
      >
        <div className="hidden w-24 shrink-0 sm:block">
          <PriorityBadge priority={ticket.priority} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-400">
              {ticket.id}
            </span>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="truncate text-sm font-medium text-slate-900">
            {ticket.subject}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>{ticket.customerName}</span>
            <ChannelTag channel={ticket.channel} />
            <CategoryBadge category={ticket.category} />
            {ticket.assignee && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {ticket.assignee}
              </span>
            )}
          </div>
        </div>
        <div className="hidden w-40 shrink-0 sm:block">
          {isResolved ? (
            <span className="text-xs text-slate-400">
              resolved in {formatDuration(ticket.resolutionMinutes ?? 0)}
            </span>
          ) : (
            <>
              <div className="mb-1 flex justify-end">
                <SlaBadge
                  priority={ticket.priority}
                  ageMinutes={ticket.ageMinutes}
                />
              </div>
              <SlaMeter
                priority={ticket.priority}
                ageMinutes={ticket.ageMinutes}
                showLabel={false}
              />
              <div className="mt-1 text-right text-[11px] text-slate-400">
                waiting {formatDuration(ticket.ageMinutes)}
              </div>
            </>
          )}
        </div>
      </button>
    </li>
  );
}
