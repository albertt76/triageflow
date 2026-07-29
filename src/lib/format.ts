export function formatDuration(totalMinutes: number): string {
  const mins = Math.round(Math.abs(totalMinutes));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/** "3h 12m ago" style relative label from minutes elapsed. */
export function formatAgo(ageMinutes: number): string {
  return `${formatDuration(ageMinutes)} ago`;
}

export function formatMinutesAsHours(totalMinutes: number): string {
  const hours = totalMinutes / 60;
  if (hours < 1) return `${Math.round(totalMinutes)}m`;
  return `${hours.toFixed(1)}h`;
}
