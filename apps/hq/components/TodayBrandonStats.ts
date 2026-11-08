/**
 * TodayBrandonStats.ts — the numbers in Brandon's progress rail, from his call log. Pure (no next/*, no
 * Supabase) so tests import it. Weeks are New York Mon-Sun weeks (same as call_weeks); the headline is calls
 * this week against the weekly goal. The streak counts consecutive weeks that hit it.
 */
import { TZ, weekStartET } from "../lib/leads";

// ponytail: weekly goals are constants — there is no goals table or setting yet. Upgrade when Nate wants to tune them in HQ.
export const GOAL = { calls: 140, reached: 25, consults: 5 };
/** Per business day, derived from the weekly call goal (the week chart's goal line). */
export const DAY_CALLS = GOAL.calls / 5;

export interface CallLite {
  at: string;
  outcome: string | null;
  name?: string | null;
}
export interface Win {
  kind: "consult" | "reached";
  name: string;
  time: string;
}
export interface RailStats {
  /** This New York week (Mon-Sun), imported rows excluded. */
  total: { calls: number; reached: number; consults: number };
  /** Most calls in any earlier week; 0 with no history. */
  best: number;
  beaten: boolean;
  /** Calls still needed this week to beat `best` (only meaningful while !beaten). */
  toBeat: number;
  /** Consecutive weeks that hit the weekly call goal; this week counts once it has, and never breaks the run before then. */
  streak: number;
  /** The last 7 weeks, oldest first, for the streak boxes; label = the Monday's day of month. */
  weeks: { label: string; hit: boolean; current: boolean }[];
  /** Per-day bars for this week; hi = today's column, -1 on a weekend. */
  week: { labels: string[]; vals: number[]; hi: number };
  wins: Win[];
}

export const dayET = (d: Date | string): string =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const hm = (d: Date) =>
  d
    .toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?[AP]M$/, "");
const addDay = (day: string, n: number) => {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const monOf = (day: string) => addDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function railStats(all: CallLite[], now: Date, goal = GOAL): RailStats {
  // 'imported' rows are a bulk-load marker, not a dial
  const calls = all.filter((c) => c.outcome !== "imported");
  const per = new Map<string, number>();
  const perWeek = new Map<string, number>();
  for (const c of calls) {
    const d = dayET(c.at);
    per.set(d, (per.get(d) ?? 0) + 1);
    perWeek.set(monOf(d), (perWeek.get(monOf(d)) ?? 0) + 1);
  }
  const today = dayET(now);
  const monday = weekStartET(now);
  const mine = calls.filter((c) => monOf(dayET(c.at)) === monday);
  const count = (f: (o: string | null) => boolean) => mine.filter((c) => f(c.outcome)).length;
  const t = {
    calls: mine.length,
    reached: count((o) => o === "reached" || o === "consult_booked"),
    consults: count((o) => o === "consult_booked"),
  };

  const best = Math.max(0, ...[...perWeek].filter(([w]) => w < monday).map(([, n]) => n));

  // weeks back from this one
  const mondays = Array.from({ length: 52 }, (_, n) => addDay(monday, -7 * n));
  const hit = (w: string) => (perWeek.get(w) ?? 0) >= goal.calls;
  // an unfinished week neither extends nor breaks the run
  let i = hit(monday) ? 0 : 1;
  let streak = 0;
  while (i < mondays.length && hit(mondays[i]!)) {
    streak++;
    i++;
  }

  const weekDays = [0, 1, 2, 3, 4].map((n) => addDay(monday, n));

  const wins: Win[] = calls
    .filter((c) => c.outcome === "reached" || c.outcome === "consult_booked")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 5)
    .map((c) => {
      const d = new Date(c.at);
      // today: the time; within the last 6 days: weekday + time; older: the date (a bare weekday would read as this week)
      const ago = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dayET(d)}T12:00:00Z`)) / 86_400_000;
      const when =
        ago === 0
          ? hm(d)
          : ago <= 6
            ? `${d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" })} ${hm(d)}`
            : d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
      return {
        kind: c.outcome === "consult_booked" ? "consult" : "reached",
        name: c.name?.trim() || "a lead",
        time: when,
      };
    });

  return {
    total: t,
    best,
    beaten: t.calls > best,
    toBeat: Math.max(0, best - t.calls + 1),
    streak,
    weeks: mondays
      .slice(0, 7)
      .reverse()
      .map((w) => ({ label: String(Number(w.slice(8))), hit: hit(w), current: w === monday })),
    week: {
      labels: WEEKDAY,
      vals: weekDays.map((d) => per.get(d) ?? 0),
      hi: weekDays.indexOf(today),
    },
    wins,
  };
}
