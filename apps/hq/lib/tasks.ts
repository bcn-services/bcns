/**
 * tasks.ts — plain functions over a Supabase client (first arg), so the UI's server actions
 * (via='ui') and item 5's MCP (via='mcp') share one write path. Every write also inserts an
 * `events` row with actor + via. No delete anywhere (the DB has no delete grant either).
 * Server actions live in app/(app)/work/actions.ts, NOT here, so none of this is a public endpoint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient;
export type Via = "ui" | "mcp" | "job";

export const OWNERS = ["nate", "brandon", "claude"] as const;
export type Owner = (typeof OWNERS)[number];
export const STATUSES = ["todo", "doing", "waiting", "done"] as const;
export type Status = (typeof STATUSES)[number];
export const SOURCES = ["manual", "tracker", "lead", "alert"] as const;
export type Source = (typeof SOURCES)[number];

/** GTM tracks first (seed-gtm), then the non-GTM areas. */
export const AREAS = [
  "warm",
  "cousin-pilot",
  "interviews",
  "associations",
  "linkedin",
  "cold-calling",
  "demos",
  "seo-ads",
  "client",
  "ops",
  "leads",
] as const;
export type Area = (typeof AREAS)[number];
export const AREA_LABEL: Record<Area, string> = {
  warm: "Warm contacts",
  "cousin-pilot": "Cousin pilot",
  interviews: "Interviews",
  associations: "Associations",
  linkedin: "LinkedIn",
  "cold-calling": "Cold calling",
  demos: "2-min demos",
  "seo-ads": "SEO + Meta ads (later)",
  client: "Client work",
  ops: "Ops",
  leads: "Lead work",
};

export const LISTS = ["warm", "interviews", "associations"] as const;
export type ListName = (typeof LISTS)[number];
export const LIST_STATUSES = ["todo", "reached", "scheduled", "done", "no"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  body: string | null;
  owner: Owner | null;
  area: string | null;
  status: Status;
  due: string | null;
  source: Source;
  business_id: string | null;
  client_slug: string | null;
  track_id: string | null;
  alert_key: string | null;
  waiting_on: string | null;
  done_at: string | null;
  created_at: string;
}

// ---- pure helpers (no DB) ---------------------------------------------------------------

/** Calendar day in America/New_York (the business timezone, same as call_weeks), YYYY-MM-DD. */
export function isoDay(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** `day` (YYYY-MM-DD) plus n whole days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function assertOwner(o: unknown): Owner {
  if (!OWNERS.includes(o as Owner)) throw new Error(`owner must be nate, brandon or claude`);
  return o as Owner;
}

function assertStatus(s: unknown): Status {
  if (!STATUSES.includes(s as Status))
    throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  return s as Status;
}

/** null / "" = unassigned (tasks.owner is nullable); anything else must be a real owner. */
export function assertOwnerOrNull(o: unknown): Owner | null {
  return o === null || o === "" ? null : assertOwner(o);
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertSlug(s: unknown): string | null {
  if (s === null || s === "") return null;
  if (typeof s !== "string" || !SLUG.test(s)) throw new Error("client_slug must be a client slug");
  return s;
}
function assertTrackId(s: unknown): string | null {
  if (s === null || s === "") return null;
  if (typeof s !== "string" || !UUID.test(s)) throw new Error("track_id must be a track id");
  return s;
}

function assertDay(d: unknown): string {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))
    throw new Error("due must be YYYY-MM-DD");
  return d;
}

/** done sets done_at; any other status clears it (updateTask keeps done_at when already done). */
export function statusPatch(
  status: unknown,
  now: Date
): { status: Status; done_at: string | null } {
  const s = assertStatus(status);
  return { status: s, done_at: s === "done" ? now.toISOString() : null };
}

export interface TaskPatch {
  status?: Status;
  owner?: Owner | null;
  client_slug?: string | null;
  track_id?: string | null;
  due?: string | null;
  waiting_on?: string | null;
  body?: string | null;
}

/** Validated DB patch for updateTask; only the keys present are touched. */
export function buildTaskPatch(p: TaskPatch, now: Date): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.status !== undefined) Object.assign(out, statusPatch(p.status, now));
  if (p.owner !== undefined) out.owner = assertOwnerOrNull(p.owner);
  if (p.client_slug !== undefined) out.client_slug = assertSlug(p.client_slug);
  if (p.track_id !== undefined) out.track_id = assertTrackId(p.track_id);
  if (p.due !== undefined) out.due = p.due === null || p.due === "" ? null : assertDay(p.due);
  if (p.waiting_on !== undefined) out.waiting_on = p.waiting_on?.trim() || null;
  if (p.body !== undefined) out.body = p.body?.trim() || null;
  if (!Object.keys(out).length) throw new Error("nothing to update");
  return { ...out, updated_at: now.toISOString() };
}

/** Status that goes with a new waiting_on: text moves a task to 'waiting'; clearing it returns 'waiting' to 'todo'. */
export function waitingStatus(text: string, current: Status): Status | undefined {
  if (text.trim()) return current === "done" ? undefined : "waiting";
  return current === "waiting" ? "todo" : undefined;
}

export function nextOwner(o: Owner | null): Owner {
  return OWNERS[(OWNERS.indexOf(o as Owner) + 1) % OWNERS.length] ?? "nate";
}

export function nextListStatus(s: ListStatus): ListStatus {
  return LIST_STATUSES[(LIST_STATUSES.indexOf(s) + 1) % LIST_STATUSES.length] ?? "todo";
}

const STATUS_RANK: Record<Status, number> = { doing: 0, todo: 1, waiting: 2, done: 3 };

/** A due date as people say it: "today", a weekday within the next 6 days, else "Oct 24". Calendar math on YYYY-MM-DD, no timezone drift. */
export function humanDay(due: string, today: string): string {
  const n = (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (n === 0) return "today";
  const d = new Date(`${due}T00:00:00Z`);
  if (n > 0 && n < 7) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Due asc, undated last. */
export function byDue(a: { due: string | null }, b: { due: string | null }): number {
  return (a.due ?? "9999").localeCompare(b.due ?? "9999");
}

const byRank = (a: Task, b: Task) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || byDue(a, b);

/** Owner sections (Nate, Brandon, Claude), each ordered by status then due. */
export function groupByOwner<T extends Task>(tasks: T[]): { owner: Owner; tasks: T[] }[] {
  return OWNERS.map((owner) => ({
    owner,
    tasks: tasks.filter((t) => t.owner === owner).sort(byRank),
  }));
}

/** Work's left list: Unassigned first (owner null), then Nate / Brandon / Claude; empty groups are left out. */
export function workGroups<T extends Task>(
  tasks: T[]
): { key: "unassigned" | Owner; label: string; tasks: T[] }[] {
  return [
    { key: "unassigned" as const, label: "Unassigned", tasks: tasks.filter((t) => !t.owner).sort(byRank) },
    ...groupByOwner(tasks).map((g) => ({
      key: g.owner,
      label: g.owner.charAt(0).toUpperCase() + g.owner.slice(1),
      tasks: g.tasks,
    })),
  ].filter((g) => g.tasks.length);
}

export interface TaskFilter {
  area?: string;
  status?: string; // "" = open (not done), "all", or one status
  owner?: string;
}

export function filterTasks(tasks: Task[], f: TaskFilter): Task[] {
  return tasks.filter(
    (t) =>
      (!f.area || t.area === f.area) &&
      (!f.owner || t.owner === f.owner) &&
      (f.status === "all" || (f.status ? t.status === f.status : t.status !== "done"))
  );
}

// ---- DB plumbing ------------------------------------------------------------------------

// The client is untyped (no generated Database type yet), so the caller names the row shape.
export function must<T>(
  r: { data: unknown; error: { message: string; code?: string } | null },
  what: string
): T {
  // code kept (PostgREST/Postgres SQLSTATE) so a caller can tell a unique violation from an outage
  if (r.error)
    throw Object.assign(new Error(`${what}: ${r.error.message}`), { code: r.error.code });
  if (r.data == null) throw new Error(`${what}: no row`);
  return r.data as T;
}

// ponytail: event is a second statement, not one transaction — a lost event row leaves a write
// unaudited; upgrade to an RPC if the audit trail ever has to be exact.
export async function logEvent(
  sb: Sb,
  actor: string,
  via: Via,
  kind: string,
  detail: Record<string, unknown>
) {
  const { error } = await sb.from("events").insert({ job: "hq", kind, detail, actor, via });
  if (error) throw new Error(`events: ${error.message}`);
}

// ---- reads ------------------------------------------------------------------------------

export async function listTasks(sb: Sb): Promise<Task[]> {
  // ponytail: whole table, capped; add paging/filters in SQL when tasks outgrow a few hundred.
  const r = await sb.from("tasks").select("*").order("created_at", { ascending: false }).limit(500);
  return must<Task[]>(r, "tasks");
}

// ---- writes -----------------------------------------------------------------------------

export interface NewTask {
  title: string;
  owner: Owner | null; // null = unassigned
  area?: string | null;
  due?: string | null;
  body?: string | null;
  status?: Status;
  source?: Source;
  businessId?: string | null;
  clientSlug?: string | null;
  trackId?: string | null;
  alertKey?: string | null;
  waitingOn?: string | null;
}

/** Validated tasks row for a NewTask (shared by createTask and the one-insert seeder). */
export function buildTaskRow(actor: string, via: Via, t: NewTask, now: Date = new Date()) {
  const title = t.title?.trim();
  if (!title) throw new Error("title required");
  if (t.area && !AREAS.includes(t.area as Area)) throw new Error(`unknown area ${t.area}`);
  if (t.source && !SOURCES.includes(t.source)) throw new Error(`unknown source ${t.source}`);
  const row = {
    title,
    owner: assertOwnerOrNull(t.owner),
    area: t.area || null,
    due: t.due ? assertDay(t.due) : null,
    body: t.body?.trim() || null,
    ...statusPatch(t.status ?? "todo", now),
    source: t.source ?? "manual",
    business_id: t.businessId ?? null,
    client_slug: assertSlug(t.clientSlug ?? null),
    track_id: assertTrackId(t.trackId ?? null),
    alert_key: t.alertKey ?? null,
    waiting_on: t.waitingOn?.trim() || null,
    created_by: actor,
    via,
  };
  return row;
}

export async function createTask(
  sb: Sb,
  actor: string,
  via: Via,
  t: NewTask,
  now: Date = new Date()
): Promise<Task> {
  const row = buildTaskRow(actor, via, t, now);
  const title = row.title;
  const task = must<Task>(await sb.from("tasks").insert(row).select().single(), "tasks insert");
  await logEvent(sb, actor, via, "task.created", {
    task_id: task.id,
    title,
    owner: row.owner,
    source: row.source,
  });
  return task;
}

export async function updateTask(
  sb: Sb,
  actor: string,
  via: Via,
  id: string,
  patch: TaskPatch,
  now: Date = new Date()
): Promise<Task> {
  const set = buildTaskPatch(patch, now);
  if (set.status === "done") {
    // done_at marks the move INTO done: saving or pressing d on an already-done task keeps it
    const cur = must<{ status: string } | null>(
      await sb.from("tasks").select("status").eq("id", id).maybeSingle(),
      "tasks read"
    );
    if (cur?.status === "done") delete set.done_at;
  }
  const task = must<Task>(
    await sb.from("tasks").update(set).eq("id", id).select().single(),
    "tasks update"
  );
  await logEvent(sb, actor, via, "task.updated", { task_id: id, ...set });
  return task;
}

/** Exactly one of taskId / businessId / clientSlug (the notes and links tables check num_nonnulls = 1). */
export interface Target {
  taskId?: string;
  businessId?: string;
  clientSlug?: string;
}

function targetCols(t: Target) {
  if ([t.taskId, t.businessId, t.clientSlug].filter(Boolean).length !== 1)
    throw new Error("exactly one of taskId, businessId, clientSlug");
  return {
    task_id: t.taskId ?? null,
    business_id: t.businessId ?? null,
    client_slug: t.clientSlug ?? null,
  };
}

export async function addNote(sb: Sb, actor: string, via: Via, n: Target & { body: string }) {
  const body = n.body?.trim();
  if (!body) throw new Error("note body required");
  const row = must<{ id: string }>(
    await sb
      .from("notes")
      .insert({ ...targetCols(n), body, actor, via })
      .select()
      .single(),
    "notes insert"
  );
  await logEvent(sb, actor, via, "note.added", { note_id: row.id, ...targetCols(n) });
  return row;
}

export async function addLink(
  sb: Sb,
  actor: string,
  via: Via,
  l: Target & { url: string; label?: string }
) {
  const url = l.url?.trim();
  if (!url || !/^https:\/\//.test(url)) throw new Error("link must be an https:// URL");
  const row = must<{ id: string }>(
    await sb
      .from("links")
      .insert({ ...targetCols(l), url, label: l.label?.trim() || null, actor, via })
      .select()
      .single(),
    "links insert"
  );
  await logEvent(sb, actor, via, "link.added", { link_id: row.id, ...targetCols(l) });
  return row;
}

export const PROPOSAL_KINDS = ["lead_stage", "finance"] as const;
export interface NewProposal {
  kind: (typeof PROPOSAL_KINDS)[number];
  targetId: string;
  field: string;
  old: unknown;
  new: unknown;
  reason?: string;
}

/**
 * Pending proposal only. Deciding is decide_proposal() (a human click), never a function here.
 * `old` and `via` below are advisory: since 0031 the proposals_server_fields trigger overwrites
 * both (old = the live value, via from the X-HQ-Via header), so a client cannot forge either.
 */
export async function propose(sb: Sb, actor: string, via: Via, p: NewProposal) {
  if (!PROPOSAL_KINDS.includes(p.kind)) throw new Error(`unknown proposal kind ${p.kind}`);
  const row = must<{ id: string }>(
    await sb
      .from("proposals")
      .insert({
        kind: p.kind,
        target_id: p.targetId,
        field: p.field,
        old: p.old ?? null,
        new: p.new,
        reason: p.reason?.trim() || null,
        status: "pending",
        created_by: actor,
        via,
      })
      .select()
      .single(),
    "proposals insert"
  );
  await logEvent(sb, actor, via, "proposal.created", { proposal_id: row.id, kind: p.kind });
  return row;
}

export const LEAD_TASK_KINDS = ["pitch", "quote", "onboard"] as const;
export type LeadTaskKind = (typeof LEAD_TASK_KINDS)[number];

/** p / q / onboard from a lead: a Claude task due in 3 days, linked to the business. */
export async function createLeadTask(
  sb: Sb,
  actor: string,
  via: Via,
  i: { businessId: string; kind: LeadTaskKind },
  now: Date = new Date()
): Promise<Task> {
  if (!LEAD_TASK_KINDS.includes(i.kind))
    throw new Error(`kind must be ${LEAD_TASK_KINDS.join(", ")}`);
  const biz = must<{ name: string }>(
    await sb.from("businesses").select("name").eq("id", i.businessId).single(),
    "business"
  );
  const verb = i.kind.charAt(0).toUpperCase() + i.kind.slice(1);
  return createTask(
    sb,
    actor,
    via,
    {
      title: `${verb} ${biz.name}`,
      owner: "claude",
      area: "leads",
      source: "lead",
      businessId: i.businessId,
      due: addDays(isoDay(now), 3),
    },
    now
  );
}

/** `c` from a fire: Nate's ops task keyed by alert_key; returns the open one if it already exists. */
export async function createOpsTask(
  sb: Sb,
  actor: string,
  via: Via,
  i: { alertKey: string; title: string },
  now: Date = new Date()
): Promise<Task> {
  const alertKey = i.alertKey?.trim();
  if (!alertKey) throw new Error("alertKey required");
  const open = async (): Promise<Task | null> => {
    const r = await sb
      .from("tasks")
      .select("*")
      .eq("alert_key", alertKey)
      .neq("status", "done")
      .limit(1)
      .maybeSingle();
    if (r.error) throw new Error(`tasks: ${r.error.message}`);
    return (r.data as Task | null) ?? null;
  };
  const existing = await open();
  if (existing) return existing;
  // The partial unique index tasks_alert_key_open_idx (0031) is the real guard: of two simultaneous
  // presses the loser gets 23505 and returns the winner's task.
  try {
    return await createTask(
      sb,
      actor,
      via,
      {
        title: i.title,
        owner: "nate",
        area: "ops",
        source: "alert",
        alertKey,
        due: addDays(isoDay(now), 2),
      },
      now
    );
  } catch (e) {
    if ((e as { code?: unknown }).code !== "23505") throw e;
    const winner = await open();
    if (winner) return winner;
    throw e;
  }
}

export async function setListItemStatus(
  sb: Sb,
  actor: string,
  via: Via,
  id: string,
  status: ListStatus
) {
  if (!LIST_STATUSES.includes(status))
    throw new Error(`status must be one of ${LIST_STATUSES.join(", ")}`);
  const row = must<{ id: string }>(
    await sb.from("list_items").update({ status }).eq("id", id).select().single(),
    "list_items"
  );
  await logEvent(sb, actor, via, "list_item.status", { list_item_id: id, status });
  return row;
}

export async function addListItem(
  sb: Sb,
  actor: string,
  via: Via,
  i: { list: ListName; business: string }
) {
  const business = i.business?.trim();
  if (!business) throw new Error("business name required");
  if (!LISTS.includes(i.list)) throw new Error(`unknown list ${i.list}`);
  const row = must<{ id: string }>(
    await sb
      .from("list_items")
      .insert({ list: i.list, business, status: "todo" })
      .select()
      .single(),
    "list_items insert"
  );
  await logEvent(sb, actor, via, "list_item.added", { list_item_id: row.id, list: i.list });
  return row;
}
