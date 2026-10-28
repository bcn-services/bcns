/**
 * load.ts — everything the Clients page and the MCP get_client tool need to derive a client's health:
 * the latest uptime checks (uptime_status, 0034), the platform's connector health (lib/ops.ts) and
 * Mercury payments (lib/money.ts). Every source fails soft; a source that cannot be read shows as
 * unreadable in the why-line instead of as a false green. No next/* import, so tests and the MCP use it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clientBilling,
  isUnavailable,
  mercuryInvoices,
  mercurySummary,
  type ClientBilling,
  type MercuryInvoice,
  type MercuryTxn,
  type Unavailable,
} from "@/lib/money";
import { opsSnapshot } from "@/lib/ops";
import { APPS, deriveHealth, type Derived, type UptimeRow } from "./health";

/** Every column the page shows, edits, or hands to clientBilling (display_name, billing_note, mercury_customer_id, aliases). */
export const CLIENT_SELECT =
  "slug, display_name, kind, stage, owner, channel, billing_note, repo_url, monthly_rate_cents, churn_date, launch_date, notes, mercury_customer_id, aliases, billing_source";

export interface ClientBase {
  slug: string;
  display_name: string;
  kind: string | null;
  stage: string | null;
  owner: string | null;
  channel: string | null;
  billing_note: string | null;
  repo_url: string | null;
  monthly_rate_cents: number | null;
  churn_date: string | null;
  launch_date: string | null;
  notes: string | null;
  mercury_customer_id: string | null;
  aliases: string[] | null;
  billing_source: string | null;
}

export interface HealthSources {
  uptime: Map<string, UptimeRow> | null;
  ops: Awaited<ReturnType<typeof opsSnapshot>>;
  txns: MercuryTxn[] | Unavailable;
  invoices: MercuryInvoice[] | Unavailable;
}

export async function loadHealthSources(sb: SupabaseClient): Promise<HealthSources> {
  const [up, ops, mercury, invoices] = await Promise.all([
    sb.from("uptime_status").select("target, ok, status, checked_at, last_ok_at"),
    opsSnapshot(),
    mercurySummary(),
    mercuryInvoices(),
  ]);
  const uptime = up.error
    ? null
    : new Map(((up.data ?? []) as UptimeRow[]).map((u) => [u.target, u]));
  return { uptime, ops, txns: isUnavailable(mercury) ? mercury : mercury.txns, invoices };
}

/** Billing + derived health for one client from already-loaded sources. */
export function deriveFor(
  c: ClientBase,
  s: HealthSources,
  now: Date = new Date()
): { billing: ClientBilling; derived: Derived } {
  const billing = clientBilling(c, s.txns, s.invoices, now.toISOString().slice(0, 10));
  const derived = deriveHealth({
    client: c,
    uptime: s.uptime,
    ops: s.ops,
    billing,
    now,
  });
  return { billing, derived };
}

/** The public app address for a client that has one on the checked list, else null. */
export const appUrl = (slug: string) =>
  APPS[slug] ? `https://${APPS[slug].uptime}.bcn-services.com` : null;

// ---- the Work tile ------------------------------------------------------------------------------

export interface TaskBrief {
  client_slug: string | null;
  title: string;
  status: string;
  due: string | null;
}
export interface WorkSummary {
  total: number;
  done: number;
  open: number;
  /** Open task due soonest (undated last), or null when none is open. */
  next: string | null;
}

export function workSummary(tasks: TaskBrief[]): WorkSummary {
  const open = tasks.filter((t) => t.status !== "done");
  const next = [...open].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))[0];
  return {
    total: tasks.length,
    done: tasks.length - open.length,
    open: open.length,
    next: next?.title ?? null,
  };
}

// ---- the page's cards ---------------------------------------------------------------------------

export interface LinkRow {
  client_slug: string;
  label: string | null;
  url: string;
}
export interface ClientCard extends ClientBase {
  derived: Derived;
  billing: ClientBilling;
  links: { label: string | null; url: string }[];
  work: WorkSummary;
  appUrl: string | null;
}

/** One card per client, in the order given. Pure. */
export function buildCards(
  clients: ClientBase[],
  s: HealthSources,
  links: LinkRow[],
  tasks: TaskBrief[],
  now: Date = new Date()
): ClientCard[] {
  return clients.map((c) => ({
    ...c,
    ...deriveFor(c, s, now),
    links: links.filter((l) => l.client_slug === c.slug).map(({ label, url }) => ({ label, url })),
    work: workSummary(tasks.filter((t) => t.client_slug === c.slug)),
    appUrl: appUrl(c.slug),
  }));
}
