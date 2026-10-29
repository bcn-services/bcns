/**
 * tracks.ts — the Work board's cards. A track is a named stream of work (a GTM channel, a client
 * project); its steps are the tasks whose track_id points at it. Same write path as tasks.ts
 * (sb first, actor + via, an events row per write). No delete anywhere (no grant, no policy).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AREAS, logEvent, must, type Area, type Task, type Via } from "./tasks";

type Sb = SupabaseClient;

export const COLUMNS = ["now", "next", "wait", "done"] as const;
export type Column = (typeof COLUMNS)[number];
export const COLUMN_LABEL: Record<Column, string> = {
  now: "Now",
  next: "Next",
  wait: "Waiting",
  done: "Done · 7 days",
};
export const DONE_WINDOW_DAYS = 7;

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
  column: Column;
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
  // ponytail: whole table; buildBoard drops done tracks past 7 days. Filter in SQL when tracks pile up.
  const r = await sb.from("tracks").select("*").order("created_at", { ascending: true }).limit(500);
  return must<Track[]>(r, "tracks");
}

/**
 * The board: tracks per column with their steps (open first), plus a Miscellaneous card for open tasks with no track. The Done column keeps only tracks
 * finished in the last 7 days. Pure, so the page, TrackBoard's callers (Today) and tests share it.
 */
export function buildBoard(
  tracks: Track[],
  tasks: Task[],
  now: Date = new Date()
): Record<Column, BoardCard[]> {
  const cutoff = now.getTime() - DONE_WINDOW_DAYS * 86_400_000;
  const board: Record<Column, BoardCard[]> = { now: [], next: [], wait: [], done: [] };
  for (const track of tracks) {
    if (track.column === "done" && !(track.done_at && Date.parse(track.done_at) > cutoff)) continue;
    const steps = tasks
      .filter((t) => t.track_id === track.id)
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
    board[track.column].push({ track, steps });
  }
  // Open tasks with no track would sit nowhere on the board: one synthetic card, last in Now, never stored.
  const orphans = tasks.filter((t) => !t.track_id && t.status !== "done");
  if (orphans.length) {
    board.now.push({
      track: {
        id: UNASSIGNED_ID,
        name: "Miscellaneous",
        area: null,
        client_slug: null,
        column: "now",
        done_at: null,
        created_at: now.toISOString(),
      },
      steps: orphans,
    });
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

export async function moveTrack(
  sb: Sb,
  actor: string,
  via: Via,
  id: string,
  column: Column,
  now: Date = new Date()
): Promise<Track> {
  const set = columnPatch(assertColumn(column), now);
  // done -> done keeps the original done_at: a repeat must not restart the 7-day Done window.
  const cur = must<Track>(await sb.from("tracks").select("*").eq("id", id).single(), "tracks read");
  if (cur.column === "done" && column === "done") return cur;
  const row = must<Track>(await sb.from("tracks").update(set).eq("id", id).select().single(), "tracks move");
  await logEvent(sb, actor, via, "track.moved", { track_id: id, ...set });
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
