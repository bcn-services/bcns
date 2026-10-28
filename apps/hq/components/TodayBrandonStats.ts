/**
 * TodayBrandonStats.ts — the numbers in Brandon's progress rail, from his call log. Pure (no next/*, no
 * Supabase) so tests import it. Days are New York days; weekends are skipped, never break a streak, and
 * never count as a missed day.
 */
import { TZ, weekStartET } from "../lib/leads";

// ponytail: daily goals are constants — there is no goals table or setting yet. Upgrade when Nate wants to tune them in HQ.
export const GOAL = { calls: 20, reached: 5, consults: 1 };

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
  today: { calls: number; reached: number; consults: number };
  /** Most calls on any earlier day; 0 with no history. */
  best: number;
  beaten: boolean;
  /** Calls still needed today to beat `best` (only meaningful while !beaten). */
  toBeat: number;
  /** Consecutive business days that hit the daily call goal; today counts once it has, and never breaks the run before then. */
  streak: number;
  /** The last 7 business days, oldest first, for the streak boxes. */
  days: { label: string; hit: boolean; today: boolean }[];
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
const isBusiness = (day: string) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
const LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function railStats(all: CallLite[], now: Date, goal = GOAL): RailStats {
  // 'imported' rows are a bulk-load marker, not a dial
  const calls = all.filter((c) => c.outcome !== "imported");
  const per = new Map<string, number>();
  for (const c of calls) per.set(dayET(c.at), (per.get(dayET(c.at)) ?? 0) + 1);
  const today = dayET(now);
  const todays = calls.filter((c) => dayET(c.at) === today);
  const count = (f: (o: string | null) => boolean) => todays.filter((c) => f(c.outcome)).length;
  const t = {
    calls: todays.length,
    reached: count((o) => o === "reached" || o === "consult_booked"),
    consults: count((o) => o === "consult_booked"),
  };

  const before = [...per].filter(([d]) => d < today).map(([, n]) => n);
  const best = Math.max(0, ...before);

  // business days back from today (or the last business day when today is a weekend)
  const bdays: string[] = [];
  for (let d = today; bdays.length < 60; d = addDay(d, -1)) if (isBusiness(d)) bdays.push(d);
  const hit = (d: string) => (per.get(d) ?? 0) >= goal.calls;
  const startsToday = bdays[0] === today;
  // an unfinished today neither extends nor breaks the run
  let i = startsToday && !hit(today) ? 1 : 0;
  let streak = 0;
  while (i < bdays.length && hit(bdays[i]!)) {
    streak++;
    i++;
  }

  const last7 = bdays.slice(0, 7).reverse();
  const monday = weekStartET(now);
  const weekDays = [0, 1, 2, 3, 4].map((n) => addDay(monday, n));

  const wins: Win[] = calls
    .filter((c) => c.outcome === "reached" || c.outcome === "consult_booked")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 5)
    .map((c) => {
      const d = new Date(c.at);
      const when =
        dayET(d) === today
          ? hm(d)
          : `${d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" })} ${hm(d)}`;
      return {
        kind: c.outcome === "consult_booked" ? "consult" : "reached",
        name: c.name?.trim() || "a lead",
        time: when,
      };
    });

  return {
    today: t,
    best,
    beaten: t.calls > best,
    toBeat: Math.max(0, best - t.calls + 1),
    streak,
    days: last7.map((d) => ({
      label: LETTER[new Date(`${d}T12:00:00Z`).getUTCDay()]!,
      hit: hit(d),
      today: d === today,
    })),
    week: {
      labels: WEEKDAY,
      vals: weekDays.map((d) => per.get(d) ?? 0),
      hi: weekDays.indexOf(today),
    },
    wins,
  };
}
