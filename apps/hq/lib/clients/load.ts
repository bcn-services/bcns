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

// ---- the Money tile's lifetime stat -------------------------------------------------------------

/**
 * What the client has paid us in total. A readable Mercury invoice list wins: the sum of this client's
 * Paid invoices (same customer-id-then-alias match clientBilling uses). Otherwise monthly_rate x billing
 * periods started (billing is in advance, so launch day starts the first) from launch_date to churn_date
 * or today, flagged `est`. If the oldest matched invoice is over a month after launch_date the list is
 * missing history: show max(sum, estimate) flagged `est`, never an exact-looking undercount. Null when
 * neither exists.
 * ponytail: the estimate assumes the full rate was paid every period (no discounts, gaps or one-offs), and
 * invoices exist only with MERCURY_INVOICING=1; upgrade when Mercury transactions are stored past their
 * 120-day window.
 */
export function lifetime(
  c: ClientBase,
  invoices: MercuryInvoice[] | Unavailable,
  now: Date = new Date()
): { cents: number; est: boolean } | null {
  const rate = c.monthly_rate_cents ?? 0;
  const from = c.launch_date ? new Date(`${c.launch_date}T00:00:00Z`) : null;
  let est: number | null = null;
  if (from && !Number.isNaN(from.getTime()) && rate > 0 && c.billing_source !== "none") {
    const churn = c.churn_date ? new Date(`${c.churn_date}T00:00:00Z`) : null;
    const to = churn && churn < now ? churn : now;
    const months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth()) -
      (to.getUTCDate() < from.getUTCDate() ? 1 : 0);
    if (months >= 0) est = rate * (months + 1);
  }
  if (!isUnavailable(invoices)) {
    const norm = (v: string) => v.trim().toLowerCase();
    const mine = invoices.filter(
      (i) =>
        i.status === "Paid" &&
        (c.mercury_customer_id
          ? i.customerId === c.mercury_customer_id
          : !!i.customer && !!c.aliases?.some((a) => norm(a) === norm(i.customer)))
    );
    if (mine.length) {
      const sum = mine.reduce((t, i) => t + i.amountCents, 0);
      const oldest = Math.min(...mine.map((i) => new Date(i.dueDate).getTime()));
      const grace = from ? new Date(from) : null;
      grace?.setUTCMonth(grace.getUTCMonth() + 1);
      if (est !== null && grace && oldest > grace.getTime())
        return { cents: Math.max(sum, est), est: true };
      return { cents: sum, est: false };
    }
  }
  return est === null ? null : { cents: est, est: true };
}

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
  lifetime: { cents: number; est: boolean } | null;
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
    lifetime: lifetime(c, s.invoices, now),
  }));
}
