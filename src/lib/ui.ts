import type { Category, Channel, Priority, Status } from "./types";
import { SlaState } from "./sla";

export const PRIORITY_STYLE: Record<
  Priority,
  { label: string; badge: string; dot: string; row: string }
> = {
  critical: {
    label: "Critical",
    badge: "bg-red-100 text-red-700 ring-red-600/20",
    dot: "bg-red-500",
    row: "border-l-red-500",
  },
  high: {
    label: "High",
    badge: "bg-orange-100 text-orange-700 ring-orange-600/20",
    dot: "bg-orange-500",
    row: "border-l-orange-400",
  },
  medium: {
    label: "Medium",
    badge: "bg-amber-100 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-400",
    row: "border-l-amber-300",
  },
  low: {
    label: "Low",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dot: "bg-slate-400",
    row: "border-l-slate-300",
  },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  outage: "Outage",
  "how-to": "How-to",
  "feature-request": "Feature request",
};

export const CATEGORY_STYLE: Record<Category, string> = {
  billing: "bg-violet-100 text-violet-700",
  technical: "bg-blue-100 text-blue-700",
  account: "bg-teal-100 text-teal-700",
  outage: "bg-red-100 text-red-700",
  "how-to": "bg-slate-100 text-slate-600",
  "feature-request": "bg-slate-100 text-slate-600",
};

export const CHANNEL_ICON: Record<Channel, string> = {
  email: "✉️",
  chat: "💬",
  phone: "📞",
  social: "📣",
};

export const STATUS_STYLE: Record<Status, { label: string; badge: string }> = {
  new: { label: "New", badge: "bg-sky-100 text-sky-700" },
  "in-progress": {
    label: "In progress",
    badge: "bg-indigo-100 text-indigo-700",
  },
  escalated: { label: "Escalated", badge: "bg-fuchsia-100 text-fuchsia-700" },
  resolved: { label: "Resolved", badge: "bg-emerald-100 text-emerald-700" },
};

export const SLA_STYLE: Record<
  SlaState,
  { label: string; text: string; bar: string; badge: string }
> = {
  "on-track": {
    label: "On track",
    text: "text-emerald-600",
    bar: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
  },
  "at-risk": {
    label: "At risk",
    text: "text-amber-600",
    bar: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700",
  },
  breached: {
    label: "SLA breached",
    text: "text-red-600",
    bar: "bg-red-500",
    badge: "bg-red-100 text-red-700",
  },
};
