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

export type Unavailable = { unavailable: true };
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
    console.error(`[money] ${key} unavailable: ${e instanceof Error ? e.message : "error"}`);
    const value: Unavailable = { unavailable: true };
    memo.set(key, { until: Date.now() + FAIL_TTL, value });
    return value;
  }
}

async function getJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`); // status only, never the body
  return res.json();
}

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const cents = (dollars: number) => Math.round(dollars * 100);

// --- Stripe ------------------------------------------------------------------------------------

export interface StripeSummary {
  mrrCents: number;
  activeSubscriptions: number;
  charges30dCents: number;
}

const PER_MONTH: Record<string, number> = { month: 1, year: 1 / 12, week: 52 / 12, day: 365 / 12 };

export function stripeSummary(): Promise<StripeSummary | Unavailable> {
  const key = getConfig().stripeKey;
  return memoised("stripe", key, async () => {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    // ponytail: first 100 of each list; paginate when bcns passes 100 subscriptions or charges a month.
    const [subs, charges] = await Promise.all([
      getJson("https://api.stripe.com/v1/subscriptions?status=active&limit=100", key!),
      getJson(`https://api.stripe.com/v1/charges?created[gte]=${since}&limit=100`, key!),
    ]);
    let mrr = 0;
    const list = arr(rec(subs).data);
    for (const s of list)
      for (const it of arr(rec(rec(s).items).data)) {
        const price = rec(rec(it).price);
        const rc = rec(price.recurring);
        const every = Math.max(1, num(rc.interval_count));
        mrr +=
          (num(price.unit_amount) *
            (num(rec(it).quantity) || 1) *
            (PER_MONTH[String(rc.interval)] ?? 0)) /
          every;
      }
    const charged = arr(rec(charges).data)
      .map(rec)
      .filter((c) => c.status === "succeeded")
      .reduce((s, c) => s + num(c.amount) - num(c.amount_refunded), 0);
    return {
      mrrCents: Math.round(mrr),
      activeSubscriptions: list.length,
      charges30dCents: charged,
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
  customer: string; // from /ar/customers; "" when that lookup is not available
}

export const invoicingEnabled = () => process.env.MERCURY_INVOICING === "1";

export function mercuryInvoices(): Promise<MercuryInvoice[] | Unavailable> {
  const key = getConfig().mercuryKey;
  if (!invoicingEnabled()) return Promise.resolve({ unavailable: true });
  return memoised("mercury-invoices", key, async () => {
    const [inv, cus] = await Promise.all([
      getJson(`${MERCURY}/ar/invoices?limit=1000&order=desc`, key!),
      getJson(`${MERCURY}/ar/customers`, key!).catch(() => ({})),
    ]);
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
      }));
  });
}

// --- per-client billing ------------------------------------------------------------------------

/** Case-insensitive "counterparty contains client name". Names under 3 chars are skipped: "SB" would
 *  match half the bank statement, so those clients rely on billing_note. */
export function nameMatches(clientName: string, counterparty: string): boolean {
  const n = clientName.trim().toLowerCase();
  return n.length >= 3 && counterparty.toLowerCase().includes(n);
}

export interface ClientBilling {
  /** false when Mercury could not be read; the note still shows. */
  mercury: boolean;
  lastPaid: { at: string; amountCents: number } | null;
  /** Mercury invoices only (MERCURY_INVOICING=1). */
  invoice: { nextDue: string | null; overdue: number } | null;
  note: string | null;
}

export function clientBilling(
  client: { display_name: string; billing_note: string | null },
  txns: MercuryTxn[] | Unavailable,
  invoices: MercuryInvoice[] | Unavailable | null = null,
  today: string = new Date().toISOString().slice(0, 10)
): ClientBilling {
  const note = client.billing_note?.trim() || null;
  if (isUnavailable(txns)) return { mercury: false, lastPaid: null, invoice: null, note };
  const hit = txns.find(
    (t) => t.amountCents > 0 && nameMatches(client.display_name, t.counterparty)
  ); // newest first
  let invoice: ClientBilling["invoice"] = null;
  if (invoices && !isUnavailable(invoices)) {
    const mine = invoices.filter((i) => i.customer && nameMatches(client.display_name, i.customer));
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
