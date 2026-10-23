/**
 * monday.ts — the Monday panel's reads and its write-back (mark Done).
 *
 * Reads: five items of the board's "Daily" group in the board's own order
 * (api.jobs_v1.position): the not-done ones, plus any item marked Done from SB in
 * the last KEEP_DONE_MS that was not since undone, so a click leaves the row in
 * place (checked) and a second click undoes it. Write: Done / undo are queued
 * source commands (api.enqueue_source_command, via queueMarkDone / queueMarkUndone
 * and app/monday-actions.ts); the worker applies them to Monday. SB holds no
 * Monday token and learns the result from a later sync or from source_commands_v1
 * (tenant-scoped select for `authenticated`, no migration needed).
 */

import type { DataClient } from "@bcn-services/data-client";
import { taskBadge, type TaskLike, type TaskTone } from "./panels";

export const DAILY_GROUP = "Daily";
export const DAILY_LIMIT = 5;
export const MARK_DONE_KIND = "set_status_done";
export const MARK_UNDO_KIND = "set_status_undone";
/** How long an item marked Done from SB stays in the panel (and can be undone from it). */
export const KEEP_DONE_MS = 24 * 60 * 60 * 1000;

export interface DailyTask extends TaskLike {
  external_id?: string | null;
  source_updated_at?: string | null;
  position?: number | null;
}

export type CommandState = "pending" | "done" | "failed";

/** Monday item ids are plain integers; anything else never reaches the RPC. */
export function isMondayItemId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{1,20}$/.test(value);
}

/** Board order: position, else due date; undated and unpositioned last. */
function byBoardOrder(a: DailyTask, b: DailyTask): number {
  const pa = a.position ?? Infinity;
  const pb = b.position ?? Infinity;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31");
}

/**
 * Five "Daily" items in board order: the not-done ones plus the `keepIds` (items marked Done
 * from SB, see keptItemIds), so a just-done item holds its place instead of a sixth sliding in.
 * Never throws: a failed read is `{ data: null, error }`.
 */
export async function loadDailyTasks(client: DataClient, keepIds: string[] = []): Promise<{ data: DailyTask[] | null; error: unknown }> {
  const base = () =>
    client.views.jobs_v1().eq("source", "monday").eq("kind", "task").eq("group_name", DAILY_GROUP).is("deleted_at", null);
  try {
    let open = await base()
      .eq("is_done", false)
      .order("position", { ascending: true, nullsFirst: false })
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(DAILY_LIMIT);
    if (open.error) {
      // The position column ships with the platform PR (B); until its db push
      // the read errors, so fall back to due date rather than blank the panel.
      open = await base().eq("is_done", false).order("due_on", { ascending: true, nullsFirst: false }).limit(DAILY_LIMIT);
    }
    if (open.error || !keepIds.length) return open;
    const kept = await base().in("external_id", keepIds.slice(0, 50)).limit(50);
    // A failed kept read degrades to the plain not-done list.
    if (kept.error || !kept.data) return open;
    const seen = new Set((open.data ?? []).map((t) => t.external_id));
    const merged = [...(open.data ?? []), ...kept.data.filter((t) => !seen.has(t.external_id))];
    return { data: merged.sort(byBoardOrder).slice(0, DAILY_LIMIT), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** The columns of api.source_commands_v1 the panel reads (the view's Row satisfies it). */
export interface CommandRow {
  kind?: string | null;
  payload: unknown;
  status: string | null;
  created_at: string | null;
}

/**
 * Mark-done and undo commands from the last KEEP_DONE_MS, newest first. Empty when the view is not
 * deployed yet. ponytail: capped at 50 rows, so a very busy day can forget the oldest; upgrade: a
 * per-item latest-command view.
 */
export async function loadDoneCommands(client: DataClient | null, now: Date = new Date()): Promise<CommandRow[]> {
  if (!client) return [];
  try {
    const { data, error } = await client.views
      .source_commands_v1()
      .eq("source", "monday")
      .in("kind", [MARK_DONE_KIND, MARK_UNDO_KIND])
      .gte("created_at", new Date(now.getTime() - KEEP_DONE_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    return error || !data ? [] : data;
  } catch {
    return [];
  }
}

function itemIdOf(c: CommandRow): string | null {
  // payload is jsonb written by queueToggle; item_id is re-validated by isMondayItemId.
  const id = c.payload && typeof c.payload === "object" ? (c.payload as { item_id?: unknown }).item_id : null;
  return isMondayItemId(id) ? id : null;
}

/**
 * Items to keep in the panel although done: the newest command that did not fail (within KEEP_DONE_MS
 * of `now`) is a mark-done. A later undo drops the item; a failed command changed nothing and is skipped.
 */
export function keptItemIds(commands: CommandRow[], now: Date = new Date()): string[] {
  const since = now.getTime() - KEEP_DONE_MS;
  const decided = new Map<string, boolean>();
  for (const c of [...commands].sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))) {
    const id = itemIdOf(c);
    if (!id || decided.has(id) || c.status === "failed" || !(Date.parse(c.created_at ?? "") >= since)) continue;
    if (c.kind === MARK_DONE_KIND || c.kind === MARK_UNDO_KIND) decided.set(id, c.kind === MARK_DONE_KIND);
  }
  return [...decided].filter(([, kept]) => kept).map(([id]) => id);
}

/** Done (or undo) as the row should read it. A failed newest command is shown with its note and the board's state. */
export interface ItemCommand {
  kind: "done" | "undo";
  state: CommandState;
}

/** Whether the row reads checked: a command still in flight or applied decides, else the synced board state. */
export function isChecked(task: Pick<DailyTask, "is_done">, cmd: ItemCommand | undefined): boolean {
  if (cmd && cmd.state !== "failed") return cmd.kind === "done";
  return Boolean(task.is_done);
}

/** Row badge: Done when checked; an item the board still shows done but is being undone reads To Do. */
export function rowBadge(task: DailyTask, checked: boolean): { label: string; tone: TaskTone } {
  if (checked) return task.is_done ? taskBadge(task) : { label: "Done", tone: "done" };
  return taskBadge({ ...task, is_done: false, status: task.is_done ? null : task.status });
}

async function queueToggle(client: DataClient | null, itemId: unknown, want: "done" | "undo", now: Date): Promise<boolean> {
  if (!client || !isMondayItemId(itemId)) return false;
  try {
    const { data, error } = await client.views
      .jobs_v1()
      .eq("source", "monday")
      .eq("external_id", itemId)
      .is("deleted_at", null)
      .limit(1);
    const task = data?.[0];
    if (error || !task) return false;
    const cmd = commandStateByItem(await loadDoneCommands(client, now), [task]).get(itemId);
    // Done only for an item that reads open, undo only for one that reads done (board state or a command in flight).
    if (isChecked(task, cmd) !== (want === "undo")) return false;
    await client.rpc.enqueue_source_command({
      p_source: "monday",
      p_kind: want === "done" ? MARK_DONE_KIND : MARK_UNDO_KIND,
      p_payload: { item_id: itemId },
    });
    return true;
  } catch (err) {
    console.error(`monday: ${want} failed`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Queue "mark this item Done" as the signed-in user. The item must be a Monday task the user's own
 * jobs_v1 (RLS-scoped) shows and that reads open, so the call cannot be pointed at an arbitrary id.
 * Never throws: `false` means nothing was queued (bad id, no such item, already done, RPC missing or
 * raised) and the row says so.
 */
export function queueMarkDone(client: DataClient | null, itemId: unknown, now: Date = new Date()): Promise<boolean> {
  return queueToggle(client, itemId, "done", now);
}

/** The undo counterpart: only an item that reads done (synced done, or a mark-done not yet synced). */
export function queueMarkUndone(client: DataClient | null, itemId: unknown, now: Date = new Date()): Promise<boolean> {
  return queueToggle(client, itemId, "undo", now);
}

/**
 * Per-item state of the newest command (mark-done or undo). A command older than the item's last
 * sync is ignored: the sync already reflects it, so an item that still disagrees was changed on the board.
 */
export function commandStateByItem(commands: CommandRow[], tasks: DailyTask[]): Map<string, ItemCommand> {
  const syncedAt = new Map(tasks.map((t) => [t.external_id ?? "", Date.parse(t.source_updated_at ?? "")]));
  const out = new Map<string, ItemCommand>();
  for (const c of commands) {
    const id = itemIdOf(c);
    if (!id || out.has(id) || !syncedAt.has(id)) continue;
    const synced = syncedAt.get(id) ?? NaN;
    if (Number.isFinite(synced) && Date.parse(c.created_at ?? "") < synced) continue;
    // queued -> pending; anything unknown (the column is plain text) reads as pending too.
    const state: CommandState = c.status === "done" || c.status === "failed" ? c.status : "pending";
    out.set(id, { kind: c.kind === MARK_UNDO_KIND ? "undo" : "done", state });
  }
  return out;
}

/** The board's own https URL from the connector settings, else the prefix of an item URL. */
export function mondayBoardUrl(settings: ReadonlyArray<{ source?: string; target?: unknown }> | null | undefined, tasks: DailyTask[]): string | null {
  const target = settings?.find((s) => s.source === "monday")?.target;
  const fromConfig = target && typeof target === "object" && !Array.isArray(target) ? (target as { board_url?: unknown }).board_url : null;
  const candidates = [fromConfig, ...tasks.map((t) => t.url?.match(/^(.*)\/pulses\/[0-9]+/)?.[1])];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    try {
      const u = new URL(c);
      if (u.protocol === "https:") return u.toString();
    } catch {
      // not a URL; try the next candidate
    }
  }
  return null;
}

/** Board URL for the "View All" link; null when the connector has not recorded one. */
export async function loadMondayBoardUrl(client: DataClient, tasks: DailyTask[]): Promise<string | null> {
  let settings: Awaited<ReturnType<DataClient["rpc"]["source_settings_v1"]>> | null = null;
  try {
    settings = await client.rpc.source_settings_v1();
  } catch {
    // members can read it; a failure falls back to the item URLs
  }
  return mondayBoardUrl(settings, tasks);
}
