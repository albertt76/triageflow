import { slaStatus } from "@/lib/sla";
import { SLA_STYLE } from "@/lib/ui";
import { formatDuration } from "@/lib/format";
import type { Priority } from "@/lib/types";

export function SlaMeter({
  priority,
  ageMinutes,
  showLabel = true,
}: {
  priority: Priority;
  ageMinutes: number;
  showLabel?: boolean;
}) {
  const sla = slaStatus(priority, ageMinutes);
  const style = SLA_STYLE[sla.state];
  const pct = Math.min(100, sla.consumed * 100);

  return (
    <div className="w-full">
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className={`font-medium ${style.text}`}>{style.label}</span>
          <span className="text-slate-500">
            {sla.state === "breached"
              ? `over by ${formatDuration(sla.remainingMinutes)}`
              : `${formatDuration(sla.remainingMinutes)} left`}
          </span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${style.bar} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SlaBadge({
  priority,
  ageMinutes,
}: {
  priority: Priority;
  ageMinutes: number;
}) {
  const sla = slaStatus(priority, ageMinutes);
  const style = SLA_STYLE[sla.state];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
    >
      {style.label}
    </span>
  );
}
