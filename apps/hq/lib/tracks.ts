/**
 * tracks.ts — the Work board's cards. A track is a named stream of work (a GTM channel, a client
 * project); its steps are the tasks whose track_id points at it. Columns are task phases, so a track
 * shows in every column it has steps in. Same write path as tasks.ts (sb first, actor + via, an
 * events row per write). No delete anywhere (no grant, no policy).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  AREAS,
  byDue,
  isoDay,
  logEvent,
  must,
  type Area,
  type Task,
  type Via,
} from "./tasks";

type Sb = SupabaseClient;

export const COLUMNS = ["now", "next", "wait", "done"] as const;
export type Column = (typeof COLUMNS)[number];
export const COLUMN_LABEL: Record<Column, string> = {
  now: "Now",
  next: "Next",
  wait: "Waiting",
  done: "Done · 7 days",
};
export const DONE_DAYS = 7;
export const DONE_CAP = 5; // done steps per track
const NOW_DAYS = 7; // same horizon as todayQueue

/** The board's only tracks. Nobody creates or deletes one; new work is a task under one of these. */
export const FIXED_TRACKS = ["Software", "Outreach", "Marketing", "Clients", "Ops"] as const;
export const FIXED_TRACK_DESC: Record<(typeof FIXED_TRACKS)[number], string> = {
  Software: "client builds + platform + HQ itself",
  Outreach: "calls, leads, demos, GTM channels",
  Marketing: "site, SEO, ads, content",
  Clients: "support, invoicing, onboarding for signed clients",
  Ops: "admin, finance, infra, housekeeping",
};

function assertFixed(name: string) {
  if (!(FIXED_TRACKS as readonly string[]).includes(name))
    throw new Error(`tracks are fixed: ${FIXED_TRACKS.join(", ")}`);
}

export interface Track {
  id: string;
  name: string;
  area: string | null;
  client_slug: string | null;
  column: Column; // stored but unused by the board (columns are task phases); the DB check still pairs it with done_at
  done_at: string | null;
  created_at: string;
}

/** Synthetic id of the Miscellaneous card; no tracks row has it (tracks.id is a uuid). */
export const UNASSIGNED_ID = "unassigned";

export interface BoardCard {
  track: Track;
  steps: Task[];
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assertColumn(c: unknown): Column {
  if (!COLUMNS.includes(c as Column)) throw new Error(`column must be one of ${COLUMNS.join("|")}`);
  return c as Column;
}

function cleanFields(f: { name?: string; area?: string | null; client_slug?: string | null }) {
  const out: Record<string, unknown> = {};
  if (f.name !== undefined) {
    const name = f.name.trim();
    if (!name) throw new Error("name required");
    out.name = name;
  }
  if (f.area !== undefined) {
    if (f.area && !AREAS.includes(f.area as Area)) throw new Error(`unknown area ${f.area}`);
    out.area = f.area || null;
  }
  if (f.client_slug !== undefined) {
    if (f.client_slug && !SLUG.test(f.client_slug)) throw new Error("client_slug must be a client slug");
    out.client_slug = f.client_slug || null;
  }
  return out;
}

/** done_at marks the move INTO done; any other column clears it (the DB check enforces the pair). */
const columnPatch = (column: Column, now: Date) => ({
  column,
  done_at: column === "done" ? now.toISOString() : null,
});

// ---- reads ------------------------------------------------------------------------------

export async function listTracks(sb: Sb): Promise<Track[]> {
  // ponytail: whole table; buildBoard keeps only the five fixed names. Fine while tracks stay a handful.
  const r = await sb.from("tracks").select("*").order("created_at", { ascending: true }).limit(500);
  return must<Track[]>(r, "tracks");
}

/**
 * A task's board column on `today` (YYYY-MM-DD, NY): done within 7 days (older: null, off the board);
 * wait = status waiting or a waiting_on; now = doing or due within 7 days (overdue too); else next.
 */
export function phase(t: Task, today: string): Column | null {
  if (t.status === "done")
    return t.done_at && isoDay(new Date(t.done_at)) >= addDays(today, -DONE_DAYS) ? "done" : null;
  if (t.status === "waiting" || t.waiting_on?.trim()) return "wait";
  if (t.status === "doing" || (t.due && t.due <= addDays(today, NOW_DAYS))) return "now";
  return "next";
}

const newestDone = (a: Task, b: Task) => (b.done_at ?? "").localeCompare(a.done_at ?? "");

/**
 * The board: per column, one card per track with steps in that phase (FIXED_TRACKS order, then a
 * synthetic, never-stored Miscellaneous card for tasks with no track). Steps sort by due; Done keeps the
 * newest 5 per track. Tracks named outside FIXED_TRACKS are skipped. Pure, so Work, Today, MCP and tests share it.
 */
export function buildBoard(
  tracks: Track[],
  tasks: Task[],
  now: Date = new Date()
): Record<Column, BoardCard[]> {
  const today = isoDay(now);
  const misc: Track = {
    id: UNASSIGNED_ID,
    name: "Miscellaneous",
    area: null,
    client_slug: null,
    column: "now",
    done_at: null,
    created_at: now.toISOString(),
  };
  const cards = [...FIXED_TRACKS.flatMap((n) => tracks.filter((t) => t.name === n)), misc];
  const phased = tasks.map((t) => ({ t, c: phase(t, today) })); // once per task: isoDay is a locale call
  const board: Record<Column, BoardCard[]> = { now: [], next: [], wait: [], done: [] };
  for (const c of COLUMNS) {
    for (const track of cards) {
      const steps = phased
        .filter((p) => p.c === c && (p.t.track_id ?? UNASSIGNED_ID) === track.id)
        .map((p) => p.t);
      if (steps.length)
        board[c].push({ track, steps: c === "done" ? steps.sort(newestDone).slice(0, DONE_CAP) : steps.sort(byDue) });
    }
  }
  return board;
}

// ---- writes -----------------------------------------------------------------------------

export async function createTrack(
  sb: Sb,
  actor: string,
  via: Via,
  t: { name: string; area?: string | null; client_slug?: string | null; column?: Column },
  now: Date = new Date()
): Promise<Track> {
  const fields = cleanFields({ ...t, name: t.name ?? "" });
  assertFixed(String(fields.name));
  const row = must<Track>(
    await sb
      .from("tracks")
      .insert({ ...fields, ...columnPatch(assertColumn(t.column ?? "next"), now) })
      .select()
      .single(),
    "tracks insert"
  );
  await logEvent(sb, actor, via, "track.created", { track_id: row.id, name: row.name, column: row.column });
  return row;
}

export async function updateTrack(
  sb: Sb,
  actor: string,
  via: Via,
  id: string,
  f: { name?: string; area?: string | null; client_slug?: string | null }
): Promise<Track> {
  const set = cleanFields(f);
  if (!Object.keys(set).length) throw new Error("nothing to update");
  if (set.name !== undefined) assertFixed(String(set.name));
  const row = must<Track>(await sb.from("tracks").update(set).eq("id", id).select().single(), "tracks update");
  await logEvent(sb, actor, via, "track.updated", { track_id: id, ...set });
  return row;
}
