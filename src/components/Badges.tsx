import type { Category, Channel, Priority, Status } from "@/lib/types";
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  CHANNEL_ICON,
  PRIORITY_STYLE,
  STATUS_STYLE,
} from "@/lib/ui";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLE[category]}`}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

export function ChannelTag({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <span aria-hidden>{CHANNEL_ICON[channel]}</span>
      <span className="capitalize">{channel}</span>
    </span>
  );
}
