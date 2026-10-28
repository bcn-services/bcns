/**
 * finance.ts — pure weekly/monthly finance math. No IO: callers load call_weeks, businesses counts,
 * finance_inputs and finance_snapshots and hand them in. Money is integer cents.
 */

// Every assumption in one place. LTV = ARPU x margin / churn. Change here, nowhere else.
export const ASSUMPTIONS = {
  arpuCents: 10500, // ~ the two live recurring series ($100 and $110 a month)
  margin: 0.8, // gross margin on hosting + support
  monthlyChurn: 0.05, // 5% a month until there is real churn history
  hourCents: 2500, // what an hour of Nate/Brandon time is charged at in CAC
} as const;

export const LTV_CENTS = Math.round(
  (ASSUMPTIONS.arpuCents * ASSUMPTIONS.margin) / ASSUMPTIONS.monthlyChurn
);

/** The cold-calling channel: calls come from call_weeks, pilots/signed from businesses. */
export const COLD = "cold";

export interface CallWeek {
  week: string; // Monday, YYYY-MM-DD
  calls: number;
  reached: number;
  consults: number;
}
export interface StageCount {
  week: string;
  pilots: number; // businesses at consult_done, by the week they last moved
  signed: number; // businesses at won/onboarded, by the week they last moved
}
export interface Input {
  week: string;
  channel: string;
  spend_cents: number | null;
  hours: number | null;
  leads: number | null;
  pilots: number | null;
  signed: number | null;
}

export interface Row {
  period: string; // week Monday or month-01, YYYY-MM-DD
  channel: string;
  calls: number;
  reached: number;
  consults: number;
  leads: number;
  pilots: number;
  signed: number;
  spendCents: number;
  hours: number;
  costPerLeadCents: number | null; // spend / leads
  costPerSignedCents: number | null; // spend / signed
  cacCents: number | null; // (spend + hours x hourCents) / signed
  ltvCents: number;
  ltvCac: number | null;
}

export const DELTA_KEYS = [
  "calls",
  "reached",
  "consults",
  "leads",
  "pilots",
  "signed",
  "spendCents",
  "costPerLeadCents",
  "costPerSignedCents",
  "cacCents",
  "ltvCac",
] as const;
export type DeltaKey = (typeof DELTA_KEYS)[number];
export type WithDeltas = Row & { deltas: Record<DeltaKey, number | null> };

const div = (a: number, b: number): number | null => (b > 0 ? Math.round(a / b) : null);

/** Fills the derived columns from the counts. Used for weeks, months and snapshot rebuilds alike. */
export function derive(
  b: Pick<
    Row,
    | "period"
    | "channel"
    | "calls"
    | "reached"
    | "consults"
    | "leads"
    | "pilots"
    | "signed"
    | "spendCents"
    | "hours"
  >
): Row {
  const cac = div(b.spendCents + b.hours * ASSUMPTIONS.hourCents, b.signed);
  return {
    ...b,
    costPerLeadCents: div(b.spendCents, b.leads),
    costPerSignedCents: div(b.spendCents, b.signed),
    cacCents: cac,
    ltvCents: LTV_CENTS,
    ltvCac: cac ? Math.round((LTV_CENTS / cac) * 100) / 100 : null,
  };
}

// --- dates (Monday-start weeks) ----------------------------------------------------------------

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the America/New_York week containing `t` (matches call_weeks). */
export function nyWeek(t: Date | string): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(t)
  );
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7));
}

export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

// --- weekly ------------------------------------------------------------------------------------

/** Subtracts the previous period's row, same channel. Ratios stay null if either side is null. */
export function withDeltas(rows: Row[], prev: Map<string, Row>): WithDeltas[] {
  return rows.map((r) => {
    const p = prev.get(r.channel + "|" + r.period);
    const deltas = {} as Record<DeltaKey, number | null>;
    for (const k of DELTA_KEYS) {
      const a = r[k];
      const b = p?.[k];
      deltas[k] = a == null || b == null ? null : Math.round((a - b) * 100) / 100;
    }
    return { ...r, deltas };
  });
}

/**
 * `weeks` rows per channel, newest first, for the weeks ending at `now`'s week. Channels = cold plus
 * every channel with a finance_inputs row. cold leads default to people reached; inputs override
 * leads/pilots/signed when set. One extra older week is built only to feed the deltas.
 */
export function weeklyRows(args: {
  calls: CallWeek[];
  counts: StageCount[];
  inputs: Input[];
  now: Date;
  weeks?: number;
}): WithDeltas[] {
  const n = args.weeks ?? 12;
  const last = nyWeek(args.now);
  const channels = [COLD, ...new Set(args.inputs.map((i) => i.channel).filter((c) => c !== COLD))];
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const built = new Map<string, Row>();
  for (const channel of channels) {
    for (let i = n; i >= 0; i--) {
      const week = addDays(last, -7 * i);
      const input = args.inputs.find((x) => x.week === week && x.channel === channel);
      const cold = channel === COLD;
      const c = cold ? args.calls.filter((x) => x.week === week) : [];
      const s = cold ? args.counts.filter((x) => x.week === week) : [];
      const reached = sum(c, (x) => x.reached);
      built.set(
        channel + "|" + week,
        derive({
          period: week,
          channel,
          calls: sum(c, (x) => x.calls),
          reached,
          consults: sum(c, (x) => x.consults),
          leads: input?.leads ?? (cold ? reached : 0),
          pilots: input?.pilots ?? sum(s, (x) => x.pilots),
          signed: input?.signed ?? sum(s, (x) => x.signed),
          spendCents: input?.spend_cents ?? 0,
          hours: Number(input?.hours ?? 0),
        })
      );
    }
  }
  const prev = new Map<string, Row>();
  const out: Row[] = [];
  for (const channel of channels)
    for (let i = 0; i < n; i++) {
      const week = addDays(last, -7 * i);
      out.push(built.get(channel + "|" + week)!);
      prev.set(channel + "|" + week, built.get(channel + "|" + addDays(week, -7))!);
    }
  return withDeltas(out, prev);
}

// --- monthly -----------------------------------------------------------------------------------

/** Sums weekly rows into months by the month the week's Monday falls in. ponytail: a week that
 *  straddles two months counts wholly in the first; upgrade when a month-end split matters. */
export function monthlyRollup(weekly: Row[]): Row[] {
  const by = new Map<string, Row>();
  for (const w of weekly) {
    const month = monthOf(w.period);
    const k = w.channel + "|" + month;
    const m = by.get(k);
    const add = (a: number, b: number) => a + b;
    by.set(
      k,
      derive({
        period: month,
        channel: w.channel,
        calls: add(m?.calls ?? 0, w.calls),
        reached: add(m?.reached ?? 0, w.reached),
        consults: add(m?.consults ?? 0, w.consults),
        leads: add(m?.leads ?? 0, w.leads),
        pilots: add(m?.pilots ?? 0, w.pilots),
        signed: add(m?.signed ?? 0, w.signed),
        spendCents: add(m?.spendCents ?? 0, w.spendCents),
        hours: add(m?.hours ?? 0, w.hours),
      })
    );
  }
  return [...by.values()];
}

export interface Snapshot {
  month: string;
  data: { rows: Row[] };
}
export interface MonthView {
  month: string;
  frozen: boolean;
  /** Complete, fully loaded and not frozen yet: the page offers Freeze. */
  freezable: boolean;
  rows: WithDeltas[];
}

/**
 * Months newest first: every snapshot month as frozen (its stored rows), plus each live month not
 * frozen yet (the current one included) computed from `live`. Deltas are against the month before,
 * frozen or live. `win` (first loaded week + clock) decides which live months can be frozen.
 */
export function monthlyView(
  live: Row[],
  snaps: Snapshot[],
  win?: { from: string; now: Date }
): MonthView[] {
  const frozen = new Map(snaps.map((s) => [s.month, s.data.rows]));
  const months = [...new Set([...frozen.keys(), ...live.map((r) => r.period)])].sort().reverse();
  const rowsOf = (m: string) => frozen.get(m) ?? live.filter((r) => r.period === m);
  const prev = new Map<string, Row>();
  for (const m of months) {
    const [y = 0, mo = 1] = m.split("-").map(Number);
    const pm = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 10);
    for (const r of rowsOf(pm)) prev.set(r.channel + "|" + m, r);
  }
  return months.map((m) => ({
    month: m,
    frozen: frozen.has(m),
    freezable: !frozen.has(m) && !!win && freezable(m, win.from, win.now),
    rows: withDeltas(rowsOf(m), prev),
  }));
}

/**
 * Whether a month may be frozen: complete and fully loaded. Weeks belong to the month of their
 * Monday, so a month is complete once the current week's Monday is in a later month (this also holds
 * back the month whose last week is still running), and it is fully loaded when it starts at or after
 * `from`, the first loaded week (an older month is only partly there).
 */
export function freezable(month: string, from: string, now: Date): boolean {
  return month < monthOf(nyWeek(now)) && month >= from;
}

/**
 * Freeze one month: insert once, never overwrite. `insert` is the database write, returning the
 * Postgres error code on failure; a primary-key conflict (23505) means it is already frozen.
 * `win` = the loaded window's first week and the clock: an incomplete or partly loaded month refuses.
 */
export async function freezeMonth(
  insert: (row: {
    month: string;
    data: { rows: Row[]; assumptions: typeof ASSUMPTIONS };
  }) => Promise<{ code?: string; message?: string } | null>,
  month: string,
  live: Row[],
  win: { from: string; now: Date }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, reason: "bad month" };
  if (!freezable(month, win.from, win.now))
    return { ok: false, reason: "month not finished or only partly loaded" };
  const rows = live.filter((r) => r.period === month);
  if (!rows.length) return { ok: false, reason: "no data for that month" };
  const err = await insert({ month, data: { rows, assumptions: ASSUMPTIONS } });
  if (!err) return { ok: true };
  return {
    ok: false,
    reason: err.code === "23505" ? "already frozen" : (err.message ?? "insert failed"),
  };
}

// --- Numbers tabs: weekly totals, goals, unit economics ----------------------------------------

/** Weekly goals the Sales funnel tiles measure against. ponytail: constants until Nate wants them editable. */
export const GOALS = {
  calls: 60,
  reached: 20,
  consults: 3,
  pilots: 2,
  signed: 1,
  mrrCents: 100000,
} as const;

/** Unit-economics inputs that are not in the database. Change here, nowhere else. */
export const UNIT = { expectedMonths: 18, infraCents: 2100, windowWeeks: 13 } as const;

type Summed = "calls" | "reached" | "consults" | "pilots" | "signed" | "spendCents" | "hours";

/** `weeks` (Mondays, oldest first) -> the sum of `key` over every channel in each week. */
export function weekTotals(rows: Row[], weeks: string[], key: Summed): number[] {
  return weeks.map((w) => rows.filter((r) => r.period === w).reduce((s, r) => s + r[key], 0));
}

export interface UnitNow {
  cacCents: number | null;
  ltvCents: number;
  ratio: number | null;
  marginPct: number;
  paybackMonths: number | null;
  /** The trailing-window inputs the numbers came from. */
  spendCents: number;
  newClients: number;
  avgRateCents: number;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

function unitAt(rows: Row[], end: string, avgRateCents: number): UnitNow {
  const start = addDays(end, -7 * (UNIT.windowWeeks - 1));
  const win = rows.filter((r) => r.period >= start && r.period <= end);
  const sum = (k: Summed) => win.reduce((s, r) => s + r[k], 0);
  const spend = sum("spendCents") + sum("hours") * ASSUMPTIONS.hourCents; // same CAC definition as derive()
  const signed = sum("signed");
  const margin =
    avgRateCents > 0 ? Math.max(0, (avgRateCents - UNIT.infraCents) / avgRateCents) : 0;
  const cac = div(spend, signed);
  const perMonth = avgRateCents * margin;
  const ltv = Math.round(perMonth * UNIT.expectedMonths);
  return {
    cacCents: cac,
    ltvCents: ltv,
    ratio: cac ? round1(ltv / cac) : null,
    marginPct: Math.round(margin * 100),
    paybackMonths: cac && perMonth > 0 ? round1(cac / perMonth) : null,
    spendCents: spend,
    newClients: signed,
    avgRateCents,
  };
}

/** CAC, LTV, LTV:CAC, margin and payback over the trailing 90 days, as of each of `weeks` (Mondays,
 *  oldest first); the last is `now`. Series use 0 where a value is undefined (no signing yet).
 *  ponytail: the average rate is today's, so the LTV line is flat; upgrade when rates have history. */
export function unitEconomics(rows: Row[], weeks: string[], avgRateCents: number) {
  const by = weeks.map((w) => unitAt(rows, w, avgRateCents));
  const col = (f: (u: UnitNow) => number | null) => by.map((u) => f(u) ?? 0);
  return {
    now: by[by.length - 1] ?? unitAt(rows, nyWeek(new Date()), avgRateCents),
    series: {
      cac: col((u) => u.cacCents),
      ltv: col((u) => u.ltvCents),
      ratio: col((u) => u.ratio),
      margin: col((u) => u.marginPct),
      payback: col((u) => u.paybackMonths),
    },
  };
}
