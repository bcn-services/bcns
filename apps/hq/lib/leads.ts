/**
 * leads.ts — Brandon's loop: outcome map, business-day math, research parsing, and the DB writes
 * (logCall / updateLead / addLeadNote) that every caller (UI action now, MCP later) goes through.
 * No next/* imports: tests import this directly and DB functions take the Supabase client as a parameter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TZ = "America/New_York";
export type Via = "ui" | "mcp" | "job";
export type Handle = "nate" | "brandon";
export interface Actor {
  id: string;
  handle: Handle | null;
}

// ---- outcomes ---------------------------------------------------------------
export type OutcomeKey = 1 | 2 | 3 | 4;
export const OUTCOMES = {
  1: { label: "Reached", stage: "reached", outcome: "reached" },
  2: { label: "No answer", stage: "attempted", outcome: "no_answer" },
  3: { label: "Consult booked", stage: "consult_scheduled", outcome: "consult_booked" },
  4: { label: "Not interested", stage: "lost", outcome: "not_interested" },
} as const;

/** Stages a call can be logged from. */
export const LOGGABLE = ["call_due", "attempted", "reached"] as const;
export const canLog = (stage: string | null | undefined): boolean =>
  !!stage && (LOGGABLE as readonly string[]).includes(stage);

/** The old pipeline's tick still acts on these during the parallel week: HQ refuses moves into them. */
export const LATE_STAGES = ["quoting", "won", "replied"] as const;
export const lateStagesOn = (env: Record<string, string | undefined> = process.env): boolean =>
  env.HQ_LATE_STAGES === "1";

/** Stages the lead detail's stage control offers (the Today/Leads funnel); late ones only when allowed. */
export const STAGE_LABELS: Record<string, string> = {
  call_due: "Call due",
  attempted: "Attempted",
  reached: "Reached",
  consult_scheduled: "Consult scheduled",
  consult_done: "Consult done",
  quoting: "Quoting",
  won: "Won",
  lost: "Lost",
  dead: "Dead",
};
export const stageLabel = (s: string): string => STAGE_LABELS[s] ?? s.replace(/_/g, " ");
export const stageOptions = (env: Record<string, string | undefined> = process.env): string[] =>
  Object.keys(STAGE_LABELS).filter(
    (s) => lateStagesOn(env) || !(LATE_STAGES as readonly string[]).includes(s)
  );

// ---- time (America/New_York) --------------------------------------------------
function etParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
  for (const x of f.formatToParts(d)) if (x.type in p) p[x.type as keyof typeof p] = Number(x.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute };
}

/** `from` plus n business days (Sat/Sun skipped) on the New York calendar, at 08:00-09:00 ET. */
export function nextBusinessDay(from: Date, n = 1): Date {
  const { y, mo, d } = etParts(from);
  const cur = new Date(Date.UTC(y, mo - 1, d, 13));
  for (let left = n; left > 0; ) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getUTCDay() !== 0 && cur.getUTCDay() !== 6) left--;
  }
  return cur;
}

/** Monday (YYYY-MM-DD, New York) of the week containing `now`; matches call_weeks.week. */
export function weekStartET(now: Date): string {
  const { y, mo, d } = etParts(now);
  const t = new Date(Date.UTC(y, mo - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/** A datetime-local value ("2026-10-28T10:00", no zone) read as New York time. Null when malformed. */
export function etLocalToDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] as [number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = (t: number) => {
    const p = etParts(new Date(t));
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(t / 60000) * 60000;
  };
  const t = guess - off(guess - off(guess));
  const back = etParts(new Date(t));
  // reject 2026-02-31 style rollovers
  return back.y === y && back.mo === mo && back.d === d && back.h === h && back.mi === mi
    ? new Date(t)
    : null;
}

export function fmtET(iso: string | null | undefined, time = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(d);
}

export interface Research {
  fit_score?: number;
  reason?: string;
  facts?: string[];
  signals?: Record<string, boolean>;
  headcount_band?: string | null;
  locations?: number | null;
  [k: string]: unknown;
}
/** `businesses.research` is a real object on new writes, a jsonb string holding JSON on every older row. */
export function parseResearch(row: { research?: unknown } | null | undefined): Research {
  let v: unknown = row?.research;
  for (let i = 0; i < 2 && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Research) : {};
}

// ---- DB writes ---------------------------------------------------------------
type Sb = SupabaseClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

function must<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}

async function logEvent(
  sb: Sb,
  actor: Actor,
  via: Via,
  kind: string,
  businessId: string,
  detail: Record<string, unknown>
) {
  // the write it records already happened: a lost audit row is logged, not reported as a failed action
  // (a retry would then double-write)
  try {
    must(
      await sb
        .from("events")
        .insert({ job: "hq", kind, actor: actor.id, via, detail: { business_id: businessId, ...detail } })
    );
  } catch (e) {
    console.error("events insert failed", kind, businessId, e instanceof Error ? e.message : e);
  }
}

const DEDUPE_MS = 60_000;

export interface LogCallInput {
  businessId: string;
  /** Key 1-4, or the outcome code ("no_answer"). */
  outcome: OutcomeKey | (typeof OUTCOMES)[OutcomeKey]["outcome"];
  note?: string | null;
  /** Required for consult_booked. */
  consultAt?: Date | string | null;
  now?: Date;
}

/** One call = one `calls` row + one `events` row, and the lead moves. */
export async function logCall(sb: Sb, actor: Actor, via: Via, input: LogCallInput) {
  const o =
    typeof input.outcome === "number"
      ? OUTCOMES[input.outcome]
      : Object.values(OUTCOMES).find((x) => x.outcome === input.outcome);
  if (!o) throw new Error("unknown outcome");
  if (!isUuid(input.businessId)) throw new Error("bad lead id");
  const now = input.now ?? new Date();
  const note = input.note?.trim().slice(0, 2000) || null;

  const { data: b } = await sb
    .from("businesses")
    .select("id, stage, next_contact_at, consult_at")
    .eq("id", input.businessId)
    .maybeSingle();
  const cur = b as { stage: string; next_contact_at: string | null; consult_at: string | null } | null;
  if (!cur) throw new Error("lead not found");
  if (!canLog(cur.stage)) throw new Error(`cannot log a call on a ${cur.stage} lead`);
  // The stage CAS below can't catch a same-stage move (reached -> reached), so a retry after a commit the
  // client never saw would log twice. Same actor, lead and outcome within a minute = the same call (a
  // correction or a redial has a different outcome and goes through).
  const recent = must(
    await sb
      .from("calls")
      .select("id")
      .eq("business_id", input.businessId)
      .eq("actor", actor.id)
      .eq("outcome", o.outcome)
      .gte("at", new Date(now.getTime() - DEDUPE_MS).toISOString())
      .limit(1)
  );
  if (recent.data?.length) throw new Error("already logged a call on this lead a moment ago");

  const patch: Record<string, unknown> = { stage: o.stage, updated_at: now.toISOString() };
  let consultIso: string | null = null;
  if (o.stage === "consult_scheduled") {
    const c = input.consultAt ? new Date(input.consultAt) : null;
    if (!c || isNaN(c.getTime())) throw new Error("consult time required");
    consultIso = c.toISOString();
    patch.consult_at = consultIso;
    patch.next_contact_at = null;
  } else if (o.stage === "attempted") patch.next_contact_at = nextBusinessDay(now).toISOString();
  else if (o.stage === "lost") patch.next_contact_at = null;

  // compare-and-set on the stage we read: a double-submit or a concurrent edit logs nothing twice
  const moved = must(
    await sb
      .from("businesses")
      .update(patch)
      .eq("id", input.businessId)
      .eq("stage", cur.stage)
      .select("id")
  );
  if (!moved.data?.length) throw new Error("lead changed, reload");

  const call = await sb
    .from("calls")
    .insert({
      business_id: input.businessId,
      by: actor.handle,
      outcome: o.outcome,
      note,
      actor: actor.id,
      via,
      at: now.toISOString(),
    })
    .select("id")
    .single();
  if (call.error) {
    // best-effort undo so the lead isn't moved without its call row
    await sb
      .from("businesses")
      .update({ stage: cur.stage, next_contact_at: cur.next_contact_at, consult_at: cur.consult_at })
      .eq("id", input.businessId);
    throw new Error(call.error.message);
  }
  // ponytail: three PostgREST writes, no transaction — an undone move is best-effort; ceiling is an rpc
  await logEvent(sb, actor, via, "call_logged", input.businessId, {
    call_id: (call.data as { id: string }).id,
    outcome: o.outcome,
    from: cur.stage,
    to: o.stage,
    ...(consultIso ? { consult_at: consultIso } : {}),
  });
  return { callId: (call.data as { id: string }).id, stage: o.stage as string };
}

export interface LeadPatch {
  assigned_to?: Handle;
  waiting_on?: string | null;
  deal_value_cents?: number | null;
  stage?: string;
}
// businesses_stage_check (0027)
export const ALL_STAGES = [
  "sourced", "qualified", "call_due", "drafted", "approved", "sent", "replied", "quoting", "meeting",
  "quoted", "won", "onboarded", "lost", "no_email", "attempted", "reached", "consult_scheduled",
  "consult_done", "dead",
];
const PATCH_KEYS = ["assigned_to", "waiting_on", "deal_value_cents", "stage"];

export async function updateLead(
  sb: Sb,
  actor: Actor,
  via: Via,
  input: { id: string; patch: LeadPatch; env?: Record<string, string | undefined> }
) {
  const { id, patch } = input;
  if (!isUuid(id)) throw new Error("bad lead id");
  const keys = Object.keys(patch);
  if (!keys.length) throw new Error("empty patch");
  const bad = keys.find((k) => !PATCH_KEYS.includes(k));
  if (bad) throw new Error(`cannot update ${bad}`);
  if (patch.assigned_to !== undefined && patch.assigned_to !== "nate" && patch.assigned_to !== "brandon")
    throw new Error("assigned_to must be nate or brandon");
  if (patch.deal_value_cents != null && !(Number.isInteger(patch.deal_value_cents) && patch.deal_value_cents >= 0))
    throw new Error("deal_value_cents must be a non-negative integer");
  if (patch.waiting_on != null && patch.waiting_on.length > 200) throw new Error("waiting_on too long");
  if (patch.stage !== undefined) {
    if (!ALL_STAGES.includes(patch.stage)) throw new Error("unknown stage");
    if ((LATE_STAGES as readonly string[]).includes(patch.stage) && !lateStagesOn(input.env))
      throw new Error(`moves to ${patch.stage} are off (HQ_LATE_STAGES)`);
  }
  const { data: before } = await sb.from("businesses").select(keys.join(",")).eq("id", id).maybeSingle();
  if (!before) throw new Error("lead not found");
  const done = must(
    await sb
      .from("businesses")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
  );
  if (!done.data?.length) throw new Error("lead not found");
  await logEvent(sb, actor, via, "lead_updated", id, { from: before, to: patch });
}

export async function addLeadNote(
  sb: Sb,
  actor: Actor,
  via: Via,
  input: { businessId: string; body: string }
) {
  const body = input.body.trim().slice(0, 5000);
  if (!body) throw new Error("note is empty");
  if (!isUuid(input.businessId)) throw new Error("bad lead id");
  const n = await sb
    .from("notes")
    .insert({ business_id: input.businessId, body, actor: actor.id, via })
    .select("id")
    .single();
  if (n.error) throw new Error(n.error.message);
  await logEvent(sb, actor, via, "note_added", input.businessId, {
    note_id: (n.data as { id: string }).id,
  });
}

// ---- reads ---------------------------------------------------------------
export const LEAD_COLS =
  "id, name, trade, town, state, stage, fit_score, assigned_to, next_contact_at, consult_at, deal_value_cents, waiting_on, phone, domain, research, os_slug";
/** The grid's columns: LEAD_COLS without `research` (the big jsonb), which only the detail pane reads. */
export const LIST_COLS =
  "id, name, trade, town, state, stage, fit_score, assigned_to, next_contact_at, consult_at, deal_value_cents, waiting_on, phone, domain, os_slug";
export interface Lead {
  id: string;
  name: string;
  trade: string | null;
  town: string | null;
  state: string | null;
  stage: string;
  fit_score: number | null;
  assigned_to: Handle;
  next_contact_at: string | null;
  consult_at: string | null;
  deal_value_cents: number | null;
  waiting_on: string | null;
  phone: string | null;
  domain: string | null;
  research: unknown;
  /** ~/os/clients/<slug>; set by the first pitch request (lib/deliverables.ts). */
  os_slug?: string | null;
}
export interface CallRow {
  business_id: string;
  by: string | null;
  at: string;
  outcome: string | null;
  note: string | null;
}
export interface NoteRow {
  business_id: string;
  body: string;
  created_at: string;
}
export interface LinkRow {
  business_id: string;
  label: string | null;
  url: string | null;
}
export interface Extras {
  calls: CallRow[];
  notes: NoteRow[];
  links: LinkRow[];
}

const CHUNK = 100;

/** Call history, notes and links for a page of leads: three queries per 100 leads, grouped by lead. */
export async function loadExtras(sb: Sb, ids: string[]): Promise<Map<string, Extras>> {
  const out = new Map<string, Extras>(ids.map((i) => [i, { calls: [], notes: [], links: [] }]));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK); // keeps the .in() URL short and the rows under PostgREST's cap
    const [c, n, l] = await Promise.all([
      sb.from("calls").select("business_id, by, at, outcome, note").in("business_id", part).order("at", { ascending: false }),
      sb.from("notes").select("business_id, body, created_at").in("business_id", part).order("created_at", { ascending: false }),
      sb.from("links").select("business_id, label, url").in("business_id", part).order("created_at", { ascending: false }),
    ]);
    // untyped client: the selects above are the shapes
    for (const r of (must(c).data ?? []) as CallRow[]) out.get(r.business_id)?.calls.push(r);
    for (const r of (must(n).data ?? []) as NoteRow[]) out.get(r.business_id)?.notes.push(r);
    for (const r of (must(l).data ?? []) as LinkRow[]) out.get(r.business_id)?.links.push(r);
  }
  return out;
}

/**
 * Just the latest call per lead, for the grid's "Last call" column: `calls` holds that one row, notes and links
 * stay empty (loadLeadDetail has the rest). Two small column selects per 100 leads, newest first, first row wins.
 */
export async function loadLastCalls(sb: Sb, ids: string[]): Promise<Map<string, Extras>> {
  const out = new Map<string, Extras>();
  // ponytail: a 1000-row cap per chunk (PostgREST max_rows); if 100 leads log more calls than that, the oldest leads show no last call
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) parts.push(ids.slice(i, i + CHUNK));
  const res = await Promise.all(
    parts.map((part) => sb.from("calls").select("business_id, by, at, outcome, note").in("business_id", part).order("at", { ascending: false }))
  );
  for (const r of res)
    for (const c of (must(r).data ?? []) as CallRow[]) // untyped client: the select above is the shape
      if (!out.has(c.business_id)) out.set(c.business_id, { calls: [c], notes: [], links: [] });
  return out;
}

/** One lead's full row (with research) plus its calls, notes and links: what the detail pane renders. */
export async function loadLeadDetail(sb: Sb, id: string): Promise<{ lead: Lead; x: Extras } | null> {
  if (!isUuid(id)) return null;
  const [b, extras] = await Promise.all([sb.from("businesses").select(LEAD_COLS).eq("id", id).maybeSingle(), loadExtras(sb, [id])]);
  const lead = must(b).data as Lead | null; // untyped client: LEAD_COLS is the shape
  const x = extras.get(id);
  return lead && x ? { lead, x } : null;
}

const TRADE_PAGE = 1000; // PostgREST max_rows in apps/hq/supabase/config.toml: a bigger .limit() is silently cut to this
const TRADE_PAGES = 20;

/** Distinct trades for the Leads filter: pages `businesses.trade` in ordered 1000-row ranges until a short page. */
export async function loadTrades(sb: Sb): Promise<{ trades: string[]; error: string }> {
  const seen = new Set<string>();
  // ponytail: scans the column page by page, 20 pages = 20k businesses, then the list is cut short; a view or rpc past that
  for (let p = 0; p < TRADE_PAGES; p++) {
    const res = await sb
      .from("businesses")
      .select("trade")
      .is("suppressed_at", null)
      .not("trade", "is", null)
      .order("id")
      .range(p * TRADE_PAGE, (p + 1) * TRADE_PAGE - 1);
    if (res.error) return { trades: [...seen].sort(), error: res.error.message };
    const rows = (res.data ?? []) as { trade: string }[]; // untyped client: the select is the shape
    for (const r of rows) seen.add(r.trade);
    if (rows.length < TRADE_PAGE) break;
  }
  return { trades: [...seen].sort(), error: "" };
}

export interface TaskRow {
  id: string;
  title: string;
  body: string | null;
  area: string | null;
  status: string;
  due: string | null;
  waiting_on: string | null;
}
export interface BrandonToday {
  calls: Lead[];
  callsTotal: number;
  followups: Lead[];
  followupsTotal: number;
  consults: Lead[];
  tasks: TaskRow[];
  week: { calls: number; reached: number; consults: number };
  allTime: number;
}
export const CALLS_LIMIT = 5;
export const FOLLOWUPS_LIMIT = 50;

/** First instant of tomorrow in New York: follow-ups due before this are due today or overdue. */
export function startOfTomorrowET(now: Date): Date {
  const { y, mo, d } = etParts(now);
  const t = new Date(Date.UTC(y, mo - 1, d + 1));
  const z = (n: number) => String(n).padStart(2, "0");
  return etLocalToDate(`${t.getUTCFullYear()}-${z(t.getUTCMonth() + 1)}-${z(t.getUTCDate())}T00:00`) ?? t;
}

/** Everything Today(Brandon) shows, as the signed-in user (RLS applies). */
export async function loadBrandonToday(
  sb: Sb,
  me: Handle,
  opts: { all?: boolean; now?: Date } = {}
): Promise<BrandonToday> {
  const mine = () => sb.from("businesses").select(LEAD_COLS).eq("assigned_to", me).is("suppressed_at", null);
  const callsQ = mine().eq("stage", "call_due").order("fit_score", { ascending: false, nullsFirst: false }).order("name");
  // due today or overdue, plus undated (imported rows have no next_contact_at); the rest wait for their day
  const due = `next_contact_at.is.null,next_contact_at.lt.${startOfTomorrowET(opts.now ?? new Date()).toISOString()}`;
  const [calls, total, follow, followCount, consults, tasks, week, allTime] = await Promise.all([
    opts.all ? callsQ : callsQ.limit(CALLS_LIMIT),
    sb.from("businesses").select("id", { count: "exact", head: true }).eq("assigned_to", me).is("suppressed_at", null).eq("stage", "call_due"),
    mine()
      .in("stage", ["attempted", "reached"])
      .or(due)
      .order("next_contact_at", { ascending: true, nullsFirst: true })
      .order("name")
      .limit(FOLLOWUPS_LIMIT),
    sb.from("businesses").select("id", { count: "exact", head: true }).eq("assigned_to", me).is("suppressed_at", null).in("stage", ["attempted", "reached"]).or(due),
    mine().eq("stage", "consult_scheduled").order("consult_at", { ascending: true, nullsFirst: false }),
    sb.from("tasks").select("id, title, body, area, status, due, waiting_on").eq("owner", me).neq("status", "done").order("due", { ascending: true, nullsFirst: false }),
    sb.from("call_weeks").select("calls, reached, consults").eq("by", me).eq("week", weekStartET(opts.now ?? new Date())).maybeSingle(),
    sb.from("calls").select("id", { count: "exact", head: true }).eq("by", me),
  ]);
  // untyped client: the selects above are the shapes
  const w = must(week).data as { calls: number; reached: number; consults: number } | null;
  return {
    calls: (must(calls).data ?? []) as Lead[],
    callsTotal: must(total).count ?? 0,
    followups: (must(follow).data ?? []) as Lead[],
    followupsTotal: must(followCount).count ?? 0,
    consults: (must(consults).data ?? []) as Lead[],
    tasks: (must(tasks).data ?? []) as TaskRow[],
    week: { calls: Number(w?.calls ?? 0), reached: Number(w?.reached ?? 0), consults: Number(w?.consults ?? 0) },
    allTime: must(allTime).count ?? 0,
  };
}

// ---- row models (pure) -----------------------------------------------------------
export const OUTCOME_LABEL: Record<string, string> = {
  reached: "Reached",
  no_answer: "No answer",
  consult_booked: "Consult booked",
  not_interested: "Not interested",
  imported: "Imported",
};
export const fitOf = (l: Pick<Lead, "fit_score">): number | null =>
  l.fit_score == null ? null : Math.round(Number(l.fit_score));

export interface LeadRowModel {
  key: string;
  title: string;
  meta: string;
  right?: string;
  canLog: boolean;
  assigned: string;
  cells?: string[];
}
const dot = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(" · ");

/** One list row for a lead. kind picks the sub-line: Today's sections each say something different. */
export function leadRow(l: Lead, x: Extras | undefined, kind: "call" | "follow" | "consult" | "grid"): LeadRowModel {
  const last = x?.calls[0];
  const fit = fitOf(l);
  const where = dot(l.trade, l.town);
  const meta =
    kind === "follow"
      ? dot(
          where,
          last ? `${OUTCOME_LABEL[last.outcome ?? ""] ?? last.outcome} ${fmtET(last.at)}` : "no calls yet",
          l.next_contact_at && `next ${fmtET(l.next_contact_at)}`
        )
      : kind === "consult"
        ? dot(fmtET(l.consult_at, true), l.trade)
        : where;
  const row: LeadRowModel = {
    key: l.id,
    title: l.name,
    meta,
    right: fit == null ? undefined : `Fit ${fit}`,
    canLog: canLog(l.stage),
    assigned: l.assigned_to,
  };
  if (kind === "grid")
    row.cells = [
      l.name,
      l.trade ?? "",
      l.town ?? "",
      stageLabel(l.stage),
      fit == null ? "" : String(fit),
      l.assigned_to,
      last ? fmtET(last.at) : "",
      fmtET(l.next_contact_at),
      fmtET(l.consult_at, true),
    ];
  return row;
}

// ---- Leads page row model (pure; the client table renders this) --------------------------------
/** "Oct 23" (New York). */
export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
}

/** "Oct 29 2pm" / "Oct 29 2:30pm" (New York). */
export function fmtConsult(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const t = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return `${fmtShort(iso)} ${t.replace(":00", "").replace(" ", "").toLowerCase()}`;
}

/** Next-contact cell: `today` (warn chip) when due today or overdue, or a call_due lead with no date. */
export function nextCell(l: Pick<Lead, "stage" | "next_contact_at">, now = new Date()): { text: string; today: boolean } {
  if (l.next_contact_at) {
    const due = new Date(l.next_contact_at).getTime() < startOfTomorrowET(now).getTime();
    return due ? { text: "today", today: true } : { text: fmtShort(l.next_contact_at), today: false };
  }
  return l.stage === "call_due" ? { text: "today", today: true } : { text: "", today: false };
}

export interface LeadItem {
  id: string;
  name: string;
  trade: string;
  town: string;
  state: string;
  stage: string;
  stageLabel: string;
  fit: number | null;
  assigned: string;
  phone: string;
  canLog: boolean;
  domain: string;
  /** Last call / next contact / consult, as the table shows them. */
  last: string;
  /** What the last call's note said (one line, cut at 80), or "". */
  lastNote: string;
  next: { text: string; today: boolean };
  consult: string;
  consultIso: string | null;
  /** os_slug, once HQ or onboarding has named the lead's ~/os folder. */
  slug: string | null;
}
export function leadItem(l: Lead, x: Extras | undefined, now = new Date()): LeadItem {
  return {
    id: l.id,
    name: l.name,
    trade: l.trade ?? "",
    town: l.town ?? "",
    state: l.state ?? "",
    stage: l.stage,
    stageLabel: stageLabel(l.stage),
    fit: fitOf(l),
    assigned: l.assigned_to,
    phone: l.phone ?? "",
    domain: l.domain ?? "",
    canLog: canLog(l.stage),
    last: fmtShort(x?.calls[0]?.at),
    lastNote: (x?.calls[0]?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    next: nextCell(l, now),
    consult: fmtConsult(l.consult_at),
    consultIso: l.consult_at,
    slug: l.os_slug ?? null,
  };
}

/** Step 1's sub-line: the stage and what the last call said, never a claim the log doesn't back. */
export const callSummary = (l: Pick<LeadItem, "stageLabel" | "last" | "lastNote">): string =>
  `${l.stageLabel} · ${l.lastNote || (l.last ? `last call ${l.last}` : "no call logged yet")}`;
