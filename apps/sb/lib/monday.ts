/**
 * monday.ts — the Monday panel's reads and its one write.
 *
 * Reads: the first five not-done items of the board's "Daily" group, in the
 * board's own order (api.jobs_v1.position, Contract). Write: marking one Done
 * is a queued source command (api.enqueue_source_command, called from
 * app/monday-actions.ts); the worker applies it to Monday. SB holds no Monday
 * token and learns the result from a later sync or from source_commands_v1.
 */

import type { DataClient } from "@bcn-services/data-client";
import type { SourceCommandRow } from "./contract-b";
import type { TaskLike } from "./panels";
import type { createSupabaseServer } from "./supabase-server";

export const DAILY_GROUP = "Daily";
export const DAILY_LIMIT = 5;
export const MARK_DONE_KIND = "set_status_done";

export interface DailyTask extends TaskLike {
  external_id?: string | null;
  source_updated_at?: string | null;
}

export type CommandState = "pending" | "done" | "failed";

/** Monday item ids are plain integers; anything else never reaches the RPC. */
export function isMondayItemId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{1,20}$/.test(value);
}

/** First five not-done "Daily" items. Never throws: a failed read is `{ data: null, error }`. */
export async function loadDailyTasks(client: DataClient): Promise<{ data: DailyTask[] | null; error: unknown }> {
  const base = () =>
    client.views
      .jobs_v1()
      .eq("source", "monday")
      .eq("kind", "task")
      .eq("group_name", DAILY_GROUP)
      .eq("is_done", false)
      .is("deleted_at", null);
  try {
    const ordered = await base()
      .order("position", { ascending: true, nullsFirst: false })
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(DAILY_LIMIT);
    if (!ordered.error) return ordered;
    // The position column ships with the platform PR (B); until its db push
    // the read errors, so fall back to due date rather than blank the panel.
    return await base().order("due_on", { ascending: true, nullsFirst: false }).limit(DAILY_LIMIT);
  } catch (error) {
    return { data: null, error };
  }
}

type ServerClient = NonNullable<ReturnType<typeof createSupabaseServer>>;

/** Recent mark-done commands, newest first. Empty when the view is not deployed yet. */
export async function loadDoneCommands(supabase: ServerClient | null): Promise<SourceCommandRow[]> {
  if (!supabase) return [];
  try {
    // Contract: api.source_commands_v1 is not in database.types.ts until it is regenerated after B's db push.
    const { data, error } = await supabase
      .schema("api")
      .from("source_commands_v1")
      .select("id,source,kind,payload,status,created_at,done_at")
      .eq("source", "monday")
      .eq("kind", MARK_DONE_KIND)
      .order("created_at", { ascending: false })
      .limit(50);
    return error || !data ? [] : (data as SourceCommandRow[]);
  } catch {
    return [];
  }
}

/**
 * Per-item state of the newest mark-done command. A command older than the
 * item's last sync is ignored: the sync already reflects it, so an item that is
 * still not done was reopened on the board.
 */
export function commandStateByItem(commands: SourceCommandRow[], tasks: DailyTask[]): Map<string, CommandState> {
  const syncedAt = new Map(tasks.map((t) => [t.external_id ?? "", Date.parse(t.source_updated_at ?? "")]));
  const out = new Map<string, CommandState>();
  for (const c of commands) {
    const id = c.payload?.item_id;
    if (!isMondayItemId(id) || out.has(id) || !syncedAt.has(id)) continue;
    const synced = syncedAt.get(id) ?? NaN;
    if (Number.isFinite(synced) && Date.parse(c.created_at) < synced) continue;
    out.set(id, c.status === "queued" ? "pending" : c.status);
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
