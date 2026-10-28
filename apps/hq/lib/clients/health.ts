/**
 * Client health is derived, never typed in. Pure: every input is passed in, so tests need no DB.
 *   red    the app's newest uptime check failed, or a connector is auth_failed / error
 *   amber  a connector is stale / never ran, the uptime job has gone quiet, a mercury-billed
 *          client has no payment this month, an invoice is overdue, or a check could not be read
 *   green  none of the above
 * The why-line and the per-source rows come from the same pass, so they cannot disagree with the dot.
 */
import type { ClientBilling } from "@/lib/money";
import type { HealthRow } from "@/lib/ops";

export type Health = "green" | "amber" | "red";
export type Dot = "g" | "a" | "r";
export const DOT: Record<Health, Dot> = { green: "g", amber: "a", red: "r" };

/** Which app (uptime target) and platform tenant a client slug maps to. Only these slugs have one. */
// ponytail: two clients, hard-coded; move to a clients column when a third app joins the checks.
export const APPS: Record<string, { uptime: string; platform: boolean }> = {
  sb: { uptime: "sb", platform: true },
  "technology-associates": { uptime: "ta", platform: false },
};
/** A 5-minute job; past this the check itself is the problem. */
export const UPTIME_STALE_MS = 20 * 60 * 1000;

export interface UptimeRow {
  target: string;
  ok: boolean;
  status: number | null;
  checked_at: string;
  last_ok_at: string | null;
}
export interface OpsInput {
  health: HealthRow[];
  failed: string[];
}
export interface HealthInput {
  client: { slug: string; billing_source: string | null; monthly_rate_cents: number | null };
  /** uptime_status rows by target; null when the view could not be read. */
  uptime: Map<string, UptimeRow> | null;
  ops: OpsInput;
  billing: ClientBilling;
  now: Date;
}
export interface Source {
  name: string;
  dot: Dot;
  note: string;
}
export interface Derived {
  health: Health;
  why: string;
  sources: Source[];
  payment: "paid" | "unpaid" | "unknown" | "n/a";
}

const RANK: Record<Dot, number> = { g: 0, a: 1, r: 2 };

export function ago(fromIso: string | null, now: Date): string | null {
  const t = fromIso ? Date.parse(fromIso) : NaN;
  if (Number.isNaN(t)) return null;
  const m = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 48) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function appSource(slug: string, input: HealthInput): Source | null {
  const app = APPS[slug];
  if (!app) return null;
  const { uptime, now } = input;
  if (!uptime) return { name: "App", dot: "a", note: "uptime unreadable" };
  const u = uptime.get(app.uptime);
  if (!u) return { name: "App", dot: "a", note: "no uptime check yet" };
  const age = now.getTime() - Date.parse(u.checked_at);
  if (age > UPTIME_STALE_MS)
    return { name: "App", dot: "a", note: `uptime check is ${ago(u.checked_at, now)} old` };
  const code = u.status ?? "no response";
  if (u.ok) return { name: "App", dot: "g", note: `up · /api/health ${code}` };
  const down = ago(u.last_ok_at, now);
  return { name: "App", dot: "r", note: `down${down ? ` ${down}` : ""} · /api/health ${code}` };
}

function connectorSource(h: HealthRow, now: Date): Source {
  const since = ago(h.status_since, now);
  switch (h.status) {
    case "ok":
      return { name: h.source, dot: "g", note: `synced ${ago(h.last_success_at, now) ?? "?"} ago` };
    case "stale":
      return {
        name: h.source,
        dot: "a",
        note: `stale · last sync ${ago(h.last_success_at, now) ?? "never"} ago`,
      };
    case "never_ran":
      return { name: h.source, dot: "a", note: "not synced yet" };
    case "auth_failed":
      return { name: h.source, dot: "r", note: `auth failed${since ? ` ${since} ago` : ""}` };
    default:
      return { name: h.source, dot: "r", note: `error${since ? ` ${since} ago` : ""}` };
  }
}

export function deriveHealth(input: HealthInput): Derived {
  const { client, ops, billing, now } = input;
  const sources: Source[] = [];
  const app = appSource(client.slug, input);
  if (app) sources.push(app);

  const mine = ops.health.filter((h) => h.slug === client.slug);
  sources.push(...mine.map((h) => connectorSource(h, now)));
  if (!mine.length && ops.failed.length && APPS[client.slug]?.platform)
    sources.push({ name: "Connectors", dot: "a", note: "health unreadable" });

  const issues: { dot: Dot; text: string }[] = sources
    .filter((s) => s.dot !== "g")
    .map((s) => ({ dot: s.dot, text: `${s.name}: ${s.note}` }));

  // Payment: only a mercury-billed client with a rate is expected to have paid this month.
  const month = now.toISOString().slice(0, 7);
  let payment: Derived["payment"] = "n/a";
  if (client.billing_source === "mercury" && (client.monthly_rate_cents ?? 0) > 0) {
    if (!billing.mercury) payment = "unknown";
    else payment = billing.lastPaid && billing.lastPaid.at.slice(0, 7) >= month ? "paid" : "unpaid";
  }
  if (payment === "unpaid") issues.push({ dot: "a", text: "no payment this month" });
  if (payment === "unknown")
    issues.push({ dot: "a", text: "payment unverifiable (Mercury unreachable)" });
  const overdue = billing.invoice?.overdue ?? 0;
  if (overdue > 0)
    issues.push({ dot: "a", text: `${overdue} invoice${overdue > 1 ? "s" : ""} overdue` });

  const worst = issues.reduce<Dot>((w, i) => (RANK[i.dot] > RANK[w] ? i.dot : w), "g");
  const health: Health = worst === "r" ? "red" : worst === "a" ? "amber" : "green";
  // red first, then amber, so the line leads with what is most broken
  const text = [...issues].sort((a, b) => RANK[b.dot] - RANK[a.dot]).map((i) => i.text);
  const ok = [sources.length ? "all sources syncing" : "", payment === "paid" ? "paid" : ""].filter(
    Boolean
  );
  const why = text.length ? text.join(" · ") : ok.length ? ok.join(" · ") : "nothing to check yet";
  return { health, why, sources, payment };
}
