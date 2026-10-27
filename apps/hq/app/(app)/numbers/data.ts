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

/** The slice of the supabase-js client the loaders use (a fake in tests would not need it). */
type Sb = NonNullable<ReturnType<typeof import("@/lib/supabase").createSupabaseServer>>;

const WEEKS = 27; // ~6 months of weeks: enough for the monthly rollup and its deltas
export const SHOW_WEEKS = 12;

export interface Finance {
  weekly: WithDeltas[];
  months: MonthView[];
  /** Live monthly rows, as frozen by "Freeze <month>". */
  live: ReturnType<typeof monthlyRollup>;
}

export async function loadFinance(sb: Sb, now: Date = new Date()): Promise<Finance> {
  const from = addDays(nyWeek(now), -7 * WEEKS);
  const [calls, biz, inputs, snaps] = await Promise.all([
    sb.from("call_weeks").select("week, calls, reached, consults").gte("week", from),
    sb
      .from("businesses")
      .select("stage, updated_at")
      .in("stage", ["consult_done", "won", "onboarded"])
      .gte("updated_at", from),
    sb
      .from("finance_inputs")
      .select("week, channel, spend_cents, hours, leads, pilots, signed")
      .gte("week", from),
    sb.from("finance_snapshots").select("month, data"),
  ]);
  const err = calls.error ?? biz.error ?? inputs.error ?? snaps.error;
  if (err) throw new Error(err.message);

  const counts = new Map<string, StageCount>();
  for (const b of (biz.data ?? []) as { stage: string; updated_at: string }[]) {
    const week = nyWeek(b.updated_at);
    const c = counts.get(week) ?? { week, pilots: 0, signed: 0 };
    if (b.stage === "consult_done") c.pilots++;
    else c.signed++;
    counts.set(week, c);
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
    weekly: weekly.filter((r) => r.period >= addDays(nyWeek(now), -7 * (SHOW_WEEKS - 1))),
    months: monthlyView(live, (snaps.data ?? []) as Snapshot[]),
    live,
  };
}
