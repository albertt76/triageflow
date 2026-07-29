import {
  channelMix,
  csatByType,
  csatDistribution,
  headline,
  priorityMix,
  topSubjects,
  volumeByType,
  type Count,
} from "@/lib/insights";
import { formatMinutesAsHours } from "@/lib/format";
import { CHANNEL_ICON } from "@/lib/ui";
import type { Channel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights — TriageFlow" };

export default async function InsightsPage() {
  const [h, types, subjects, channels, csat, csatDist, priorities] =
    await Promise.all([
      headline(),
      volumeByType(),
      topSubjects(8),
      channelMix(),
      csatByType(),
      csatDistribution(),
      priorityMix(),
    ]);

  const totalChannel = channels.reduce((s, c) => s + c.count, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
        <p className="mt-1 text-sm text-slate-600">
          Patterns worth acting on across all{" "}
          {h.total.toLocaleString()} tickets in the database.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Tickets logged" value={h.total.toLocaleString()} />
        <Kpi
          label="Avg. CSAT"
          value={`${h.avgCsat.toFixed(2)} / 5`}
          sub={`${h.csatCount.toLocaleString()} rated`}
        />
        <Kpi
          label="Avg. resolution time"
          value={formatMinutesAsHours(h.avgResolutionMinutes)}
          sub={`${h.resolutionSample.toLocaleString()} usable timestamps`}
        />
        <Kpi
          label="Top recurring issue"
          value={h.topSubject}
          sub={`${h.topSubjectCount} tickets`}
        />
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl" aria-hidden>
            📌
          </span>
          <div>
            <h2 className="text-sm font-semibold text-amber-900">
              Recurring-pattern alert
            </h2>
            <p className="mt-0.5 text-sm text-amber-800">
              <span className="font-semibold">{h.topSubject}</span> is the
              single most common complaint ({h.topSubjectCount} tickets), and{" "}
              <span className="font-semibold">{h.worstCsatType}</span> tickets
              have the lowest satisfaction ({h.worstCsatValue.toFixed(2)}/5) —
              the best candidates for a proactive fix or a help-doc.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Volume by ticket type">
          <BarList items={types} color="bg-blue-500" />
        </Panel>

        <Panel title="Top complaint subjects">
          <BarList items={subjects} color="bg-violet-500" />
        </Panel>

        <Panel title="Satisfaction by ticket type (closed)">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 text-right font-medium">Rated</th>
                <th className="pb-2 text-right font-medium">Avg. CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {csat.map((c) => (
                <tr key={c.label}>
                  <td className="py-2 font-medium text-slate-700">{c.label}</td>
                  <td className="py-2 text-right text-slate-500">{c.count}</td>
                  <td className="py-2 text-right">
                    <CsatPill value={c.avgCsat} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="CSAT distribution (rated tickets)">
          <BarList items={csatDist} color="bg-teal-500" />
        </Panel>

        <Panel title="Priority mix">
          <BarList items={priorities} color="bg-orange-500" />
        </Panel>

        <Panel title="Where tickets come from">
          <div className="space-y-3">
            {channels.map((c) => {
              const pct = totalChannel ? (c.count / totalChannel) * 100 : 0;
              return (
                <div key={c.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium capitalize text-slate-700">
                      <span aria-hidden>
                        {CHANNEL_ICON[c.label as Channel] ?? "•"}
                      </span>
                      {c.label}
                    </span>
                    <span className="text-slate-500">
                      {c.count.toLocaleString()} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Note: the source&apos;s response/resolution timestamps are inconsistent,
        so resolution-time metrics use only the{" "}
        {h.resolutionSample.toLocaleString()} internally-consistent records.
      </p>
    </div>
  );
}

function BarList({ items, color }: { items: Count[]; color: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium capitalize text-slate-700">
              {i.label}
            </span>
            <span className="text-slate-500">{i.count.toLocaleString()}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${(i.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function CsatPill({ value }: { value: number }) {
  const tone =
    value >= 4
      ? "bg-emerald-100 text-emerald-700"
      : value >= 3
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {value ? value.toFixed(2) : "—"}
    </span>
  );
}
