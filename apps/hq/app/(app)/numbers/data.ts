import {
  addDays,
  monthlyRollup,
  monthlyView,
  nyWeek,
  weeklyRows,
  type CallWeek,
  type Input,
  type MonthView,
  type Snapshot,
  type StageCount,
  type WithDeltas,
} from "@/lib/finance";
import type { BillingKeys, RateRow } from "@/lib/money";

/** The slice of the supabase-js client the loaders use (a fake in tests would not need it). */
type Sb = NonNullable<ReturnType<typeof import("@/lib/supabase").createSupabaseServer>>;

const WEEKS = 27; // ~6 months of weeks: enough for the monthly rollup and its deltas
export const SHOW_WEEKS = 12;

export const TABS = [
  ["money", "Money", "Stripe + Mercury, live"],
  ["sales", "Sales funnel", "this week vs goal"],
  ["ops", "Ops", "connectors, jobs, tickets"],
  ["unit", "Unit economics", "trailing 90 days"],
] as const;
export type Tab = (typeof TABS)[number][0];
export const parseTab = (v: unknown): Tab => TABS.find((t) => t[0] === v)?.[0] ?? "money";

/** The clients columns Numbers reads: the rate behind MRR, and the keys that find a client's payments. */
export interface NumbersClient extends RateRow, BillingKeys {
  slug: string;
  display_name: string;
  billing_note: string | null;
}
export async function loadClients(sb: Sb): Promise<NumbersClient[]> {
  const { data, error } = await sb
    .from("clients")
    .select(
      "slug, display_name, billing_note, monthly_rate_cents, billing_source, churn_date, launch_date, mercury_customer_id, aliases"
    )
    .order("slug");
  if (error) throw new Error(error.message);
  return (data ?? []) as NumbersClient[];
}

export interface Finance {
  /** Every loaded week, newest first, every channel: the unit-economics window needs more than `weekly`. */
  all: WithDeltas[];
  weekly: WithDeltas[];
  months: MonthView[];
  /** Live monthly rows, as frozen by "Freeze <month>". */
  live: ReturnType<typeof monthlyRollup>;
  /** First loaded week (a Monday): months starting before it are only partly loaded. */
  from: string;
}

export async function loadFinance(sb: Sb, now: Date = new Date()): Promise<Finance> {
  const from = addDays(nyWeek(now), -7 * WEEKS);
  const [calls, biz, inputs, snaps] = await Promise.all([
    sb.from("call_weeks").select("week, calls, reached, consults").gte("week", from),
    // Pilots and signed are bucketed by when the lead first reached consult_done / won (stamped by
    // 0030's trigger), at any current stage, so a later move never drops or double-counts one.
    sb
      .from("businesses")
      .select("consult_done_at, won_at")
      .or(`consult_done_at.gte.${from},won_at.gte.${from}`),
    sb
      .from("finance_inputs")
      .select("week, channel, spend_cents, hours, leads, pilots, signed")
      .gte("week", from),
    sb.from("finance_snapshots").select("month, data"),
  ]);
  const err = calls.error ?? biz.error ?? inputs.error ?? snaps.error;
  if (err) throw new Error(err.message);

  const counts = new Map<string, StageCount>();
  const bump = (at: string | null, k: "pilots" | "signed") => {
    if (!at) return;
    const week = nyWeek(at);
    if (week < from) return;
    const c = counts.get(week) ?? { week, pilots: 0, signed: 0 };
    c[k]++;
    counts.set(week, c);
  };
  for (const b of (biz.data ?? []) as { consult_done_at: string | null; won_at: string | null }[]) {
    bump(b.consult_done_at, "pilots");
    bump(b.won_at, "signed");
  }
  const weekly = weeklyRows({
    calls: (calls.data ?? []) as CallWeek[],
    counts: [...counts.values()],
    inputs: (inputs.data ?? []) as Input[],
    now,
    weeks: WEEKS,
  });
  const live = monthlyRollup(weekly);
  return {
    all: weekly,
    weekly: weekly.filter((r) => r.period >= addDays(nyWeek(now), -7 * (SHOW_WEEKS - 1))),
    months: monthlyView(live, (snaps.data ?? []) as Snapshot[], { from, now }),
    live,
    from,
  };
}
