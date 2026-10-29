/**
 * money.ts — Stripe and Mercury, read-only, plain fetch. Keys come from env (STRIPE_KEY: a
 * restricted read-only key; MERCURY_KEY: a read-only API token). Every call is memoised for 10
 * minutes and fails soft to `{unavailable: true}`: a missing key, a timeout, a non-2xx or a bad
 * shape never breaks a page.
 *
 * Cost: Mercury's Accounts + Transactions API is free on every plan. The Invoicing (AR) API needs a
 * paid Mercury plan, so invoices are fetched only when MERCURY_INVOICING=1 (off by default).
 */
import { getConfig } from "./env";
import { addDays, nyWeek } from "./finance";

/** `error` is a status line only (host, path, HTTP status), never a response body or a key. */
export type Unavailable = { unavailable: true; error?: string };
export const isUnavailable = (v: unknown): v is Unavailable =>
  typeof v === "object" && v !== null && "unavailable" in v;

const OK_TTL = 10 * 60_000;
const FAIL_TTL = 60_000; // a down vendor is retried after a minute, not on every render
const memo = new Map<string, { until: number; value: unknown }>();
export const clearMoneyMemo = () => memo.clear();

async function memoised<T>(
  key: string,
  needsKey: string | undefined,
  load: () => Promise<T>
): Promise<T | Unavailable> {
  if (!needsKey) return { unavailable: true };
  const hit = memo.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T | Unavailable;
  try {
    const value = await load();
    memo.set(key, { until: Date.now() + OK_TTL, value });
    return value;
  } catch (e) {
    const error = e instanceof Error ? e.message : "error";
    console.error(`[money] ${key} unavailable: ${error}`);
    const value: Unavailable = { unavailable: true, error };
    memo.set(key, { until: Date.now() + FAIL_TTL, value });
    return value;
  }
}

/** Throws a status line only (host, path with any account id masked, status). The detail of a network
 *  or parse failure stays in the server log: it can quote a response body. */
async function getJson(url: string, token: string): Promise<unknown> {
  const u = new URL(url);
  const where = `${u.host}${u.pathname.replace(/\/account\/[^/]+/, "/account/…")}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch (e) {
    console.error(
      `[money] ${u.host}${u.pathname} fetch failed: ${e instanceof Error ? e.message : e}`
    );
    throw new Error(`${where} unreachable`);
  }
  if (!res.ok) throw new Error(`${where} ${res.status}`);
  try {
    return await res.json();
  } catch (e) {
    console.error(`[money] ${u.host}${u.pathname} bad body: ${e instanceof Error ? e.message : e}`);
    throw new Error(`${where} invalid response`);
  }
}

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const cents = (dollars: number) => Math.round(dollars * 100);

// --- Stripe ------------------------------------------------------------------------------------

export interface StripeSub {
  id: string;
  mrrCents: number;
  created: number; // unix seconds
  /** cancel_at_period_end: still active, but ends at `cancelAt` (YYYY-MM-DD, "" if Stripe gave none). */
  cancelling: boolean;
  cancelAt: string;
}
export interface StripeSummary {
  /** Active subscriptions that are not cancelling. */
  mrrCents: number;
  /** Counted in mrrCents. */
  activeSubscriptions: number;
  charges30dCents: number;
  subs: StripeSub[];
  /** The cancelling subs left out of mrrCents. */
  excluded: { id: string; cancelAt: string }[];
}

const PER_MONTH: Record<string, number> = { month: 1, year: 1 / 12, week: 52 / 12, day: 365 / 12 };
const day = (unix: number) => (unix > 0 ? new Date(unix * 1000).toISOString().slice(0, 10) : "");

export function stripeSummary(): Promise<StripeSummary | Unavailable> {
  const key = getConfig().stripeKey;
  return memoised("stripe", key, async () => {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    // ponytail: first 100 of each list; paginate when bcns passes 100 subscriptions or charges a month.
    const [raw, charges] = await Promise.all([
      getJson("https://api.stripe.com/v1/subscriptions?status=active&limit=100", key!),
      getJson(`https://api.stripe.com/v1/charges?created[gte]=${since}&limit=100`, key!),
    ]);
    const subs: StripeSub[] = arr(rec(raw).data)
      .map(rec)
      .map((s) => {
        const items = arr(rec(s.items).data).map(rec);
        let mrr = 0;
        for (const it of items) {
          const price = rec(it.price);
          const rc = rec(price.recurring);
          mrr +=
            (num(price.unit_amount) *
              (num(it.quantity) || 1) *
              (PER_MONTH[String(rc.interval)] ?? 0)) /
            Math.max(1, num(rc.interval_count));
        }
        return {
          id: String(s.id ?? ""),
          mrrCents: Math.round(mrr),
          created: num(s.created),
          // a custom cancel date (Dashboard "cancel on …") sets cancel_at without cancel_at_period_end
          cancelling: s.cancel_at_period_end === true || num(s.cancel_at) > 0,
          // newer API versions keep the period end on the item
          cancelAt: day(
            num(s.cancel_at) || num(s.current_period_end) || num(items[0]?.current_period_end)
          ),
        };
      });
    const counted = subs.filter((s) => !s.cancelling);
    const charged = arr(rec(charges).data)
      .map(rec)
      .filter((c) => c.status === "succeeded")
      .reduce((t, c) => t + num(c.amount) - num(c.amount_refunded), 0);
    return {
      mrrCents: counted.reduce((t, s) => t + s.mrrCents, 0),
      activeSubscriptions: counted.length,
      charges30dCents: charged,
      subs,
      excluded: subs.filter((s) => s.cancelling).map((s) => ({ id: s.id, cancelAt: s.cancelAt })),
    };
  });
}

// --- Mercury (free route: accounts + transactions) ---------------------------------------------

export interface MercuryTxn {
  at: string; // ISO
  amountCents: number; // > 0 incoming
  counterparty: string;
  status: string;
}
export interface MercurySummary {
  balanceCents: number;
  in30dCents: number;
  out30dCents: number;
  /** Last ~120 days, newest first; billing status is read from these. */
  txns: MercuryTxn[];
}

const MERCURY = "https://api.mercury.com/api/v1";
const COUNTED = new Set(["pending", "sent"]);
const LOOKBACK_DAYS = 120;

export function mercurySummary(now: Date = new Date()): Promise<MercurySummary | Unavailable> {
  const key = getConfig().mercuryKey;
  return memoised("mercury", key, async () => {
    const accounts = arr(rec(await getJson(`${MERCURY}/accounts`, key!)).accounts).map(rec);
    const start = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
    const pages = await Promise.all(
      accounts.map((a) =>
        getJson(
          `${MERCURY}/account/${encodeURIComponent(String(a.id))}/transactions?start=${start}&limit=1000`,
          key!
        )
      )
    );
    const txns: MercuryTxn[] = pages
      .flatMap((p) => arr(rec(p).transactions))
      .map(rec)
      .filter((t) => COUNTED.has(String(t.status)))
      .map((t) => ({
        at: String(t.postedAt ?? t.createdAt ?? ""),
        amountCents: cents(num(t.amount)),
        counterparty: String(t.counterpartyName ?? ""),
        status: String(t.status),
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
    const cut = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const recent = txns.filter((t) => t.at >= cut);
    return {
      balanceCents: accounts.reduce((s, a) => s + cents(num(a.currentBalance)), 0),
      in30dCents: recent.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0),
      out30dCents: -recent.filter((t) => t.amountCents < 0).reduce((s, t) => s + t.amountCents, 0),
      txns,
    };
  });
}

// --- Mercury Invoicing (PAID plan; MERCURY_INVOICING=1 only) -----------------------------------

export interface MercuryInvoice {
  number: string;
  status: string; // Unpaid | Paid | Cancelled | Processing
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  customer: string; // the /ar/customers name for customerId
  customerId?: string; // the key clients.mercury_customer_id matches
}

export const invoicingEnabled = () => process.env.MERCURY_INVOICING === "1";

/** Both calls must succeed: a 403 on either (no Invoicing scope / not on the paid plan) is an
 *  Unavailable carrying the message, so the page shows why instead of an empty list. */
export function mercuryInvoices(): Promise<MercuryInvoice[] | Unavailable> {
  const key = getConfig().mercuryKey;
  if (!invoicingEnabled()) return Promise.resolve({ unavailable: true });
  return memoised("mercury-invoices", key, async () => {
    const [inv, cus] = await Promise.all([
      getJson(`${MERCURY}/ar/invoices?limit=1000&order=desc`, key!),
      getJson(`${MERCURY}/ar/customers`, key!),
    ]).catch((e) => {
      throw new Error(
        `Mercury invoicing: ${e instanceof Error ? e.message : "error"} (needs the Invoicing scope on a paid plan)`
      );
    });
    const names = new Map(
      arr(rec(cus).customers)
        .map(rec)
        .map((c) => [String(c.id), String(c.name ?? "")])
    );
    return arr(rec(inv).invoices)
      .map(rec)
      .map((i) => ({
        number: String(i.invoiceNumber ?? ""),
        status: String(i.status ?? ""),
        amountCents: cents(num(i.amount)),
        dueDate: String(i.dueDate ?? "").slice(0, 10),
        customer: names.get(String(i.customerId)) ?? "",
        customerId: String(i.customerId ?? ""),
      }));
  });
}

// --- per-client billing ------------------------------------------------------------------------

/** The match keys a client row carries. No keys, no match: a name is never guessed from display_name. */
export interface BillingKeys {
  mercury_customer_id?: string | null;
  aliases?: string[] | null;
}
const norm = (v: string) => v.trim().toLowerCase();
const aliasOf = (c: BillingKeys, name: string) =>
  !!name && !!c.aliases?.some((a) => norm(a) === norm(name)); // exact name, not contains

export interface ClientBilling {
  /** false when Mercury could not be read; the note still shows. */
  mercury: boolean;
  lastPaid: { at: string; amountCents: number } | null;
  /** Mercury invoices only (MERCURY_INVOICING=1). */
  invoice: { nextDue: string | null; overdue: number } | null;
  note: string | null;
}

export function clientBilling(
  client: {
    display_name: string;
    billing_note: string | null;
    monthly_rate_cents?: number | null;
  } & BillingKeys,
  txns: MercuryTxn[] | Unavailable,
  invoices: MercuryInvoice[] | Unavailable | null = null,
  today: string = new Date().toISOString().slice(0, 10)
): ClientBilling {
  const note = client.billing_note?.trim() || null;
  if (isUnavailable(txns)) return { mercury: false, lastPaid: null, invoice: null, note };
  // ponytail: with a rate set only a payment of exactly that many cents is "the monthly payment"
  // (Mercury marks no invoice as recurring, so one-off build fees/consults are told apart by amount);
  // a rate change or a partial payment misses. Upgrade: a series id if Mercury ever exposes one.
  const rate = client.monthly_rate_cents ?? 0;
  const isMonthly = (cents: number) => cents > 0 && (rate <= 0 || cents === rate);
  let hit: { at: string; amountCents: number } | undefined = txns.find(
    (t) => isMonthly(t.amountCents) && aliasOf(client, t.counterparty)
  ); // newest first; Mercury transactions carry no customer id, so aliases are the only key
  let invoice: ClientBilling["invoice"] = null;
  if (invoices && !isUnavailable(invoices)) {
    // customer id when the client has one; the alias match is the fallback, not an extra
    const byId = !!client.mercury_customer_id;
    const mine = invoices.filter((i) =>
      byId ? i.customerId === client.mercury_customer_id : aliasOf(client, i.customer)
    );
    // ponytail: an invoice has no paid date here, so its due date stands in when no transaction matched
    const paid = mine
      .filter((i) => i.status === "Paid" && isMonthly(i.amountCents))
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    if (!hit && paid) hit = { at: paid.dueDate, amountCents: paid.amountCents };
    const unpaid = mine.filter((i) => i.status === "Unpaid");
    invoice = {
      nextDue:
        unpaid
          .map((i) => i.dueDate)
          .filter((d) => d >= today)
          .sort()[0] ?? null,
      overdue: unpaid.filter((i) => i.dueDate < today).length,
    };
  }
  return {
    mercury: true,
    lastPaid: hit ? { at: hit.at, amountCents: hit.amountCents } : null,
    invoice,
    note,
  };
}

// --- MRR and the weekly series the Numbers tiles draw ------------------------------------------

export interface RateRow {
  monthly_rate_cents: number | null;
  billing_source?: string | null;
  churn_date?: string | null;
  launch_date?: string | null;
}
export interface Mrr {
  total: number;
  stripe: number;
  mercury: number;
  /** Stripe subs left out because they cancel at period end. */
  excluded: { id: string; cancelAt: string }[];
}

const viaMercury = (c: RateRow) => c.billing_source === "mercury" && !c.churn_date;

/** Mercury's AR API has no recurring-series endpoint, so Mercury MRR is the contracted monthly rate
 *  of the clients billed through Mercury and not churned. Stripe is the live active subscriptions
 *  minus the ones cancelling. A Stripe outage counts as $0 here; the page shows the chip beside it. */
export function mrr(stripe: StripeSummary | Unavailable, clients: RateRow[]): Mrr {
  const s = isUnavailable(stripe) ? 0 : stripe.mrrCents;
  const m = clients.filter(viaMercury).reduce((t, c) => t + (c.monthly_rate_cents ?? 0), 0);
  return {
    total: s + m,
    stripe: s,
    mercury: m,
    excluded: isUnavailable(stripe) ? [] : stripe.excluded,
  };
}

/** `weeks` = Monday dates, oldest first. MRR at each week's end, rebuilt from launch/churn dates and
 *  Stripe `created`. ponytail: subs that already ended are not listed by Stripe's active filter, so
 *  history understates Stripe; upgrade when a subscription ledger exists. */
export function mrrSeries(
  weeks: string[],
  stripe: StripeSummary | Unavailable,
  clients: RateRow[]
): number[] {
  return weeks.map((w) => {
    const end = addDays(w, 6);
    const m = clients
      .filter(
        (c) =>
          c.billing_source === "mercury" &&
          (!c.launch_date || c.launch_date <= end) &&
          (!c.churn_date || c.churn_date > end)
      )
      .reduce((t, c) => t + (c.monthly_rate_cents ?? 0), 0);
    const s = isUnavailable(stripe)
      ? 0
      : stripe.subs
          // a cancelling sub billed until its cancel date: it only drops from MRR from then on
          .filter(
            (x) => day(x.created) <= end && (!x.cancelling || !x.cancelAt || end < x.cancelAt)
          )
          .reduce((t, x) => t + x.mrrCents, 0);
    return m + s;
  });
}

/** Cash at each week's end, plus money in and out per week, from the ~120 days of transactions
 *  already fetched. ponytail: transfers between bcns's own Mercury accounts show as in and out. */
export function mercuryWeeks(weeks: string[], m: MercurySummary) {
  const bucket = (w: string) => m.txns.filter((t) => t.at && nyWeek(t.at) === w);
  return {
    inflow: weeks.map((w) =>
      bucket(w)
        .filter((t) => t.amountCents > 0)
        .reduce((s, t) => s + t.amountCents, 0)
    ),
    burn: weeks.map(
      (w) =>
        bucket(w)
          .filter((t) => t.amountCents < 0)
          .reduce((s, t) => s - t.amountCents, 0) // 0 minus, so an empty week is 0 and never -0
    ),
    cash: weeks.map(
      (w) =>
        m.balanceCents -
        m.txns.filter((t) => t.at && nyWeek(t.at) > w).reduce((s, t) => s + t.amountCents, 0)
    ),
  };
}
