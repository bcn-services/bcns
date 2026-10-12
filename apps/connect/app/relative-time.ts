import { formatDateTime } from "../lib/data-format";

const DAY = 86_400_000;

/** "just now", "12m ago", "7h ago", "2d ago"; past ~30 days the date in `timeZone`. Unparseable input is "never". */
export function relativeTime(iso: string | null, now: number, timeZone?: string | null): string {
  const at = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(at)) return "never";
  const ms = now - at;
  if (ms < 60_000) return "just now"; // also future timestamps (clock skew)
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * DAY) return `${Math.floor(ms / DAY)}d ago`;
  return formatDateTime(iso, timeZone ?? undefined).slice(0, 10);
}
