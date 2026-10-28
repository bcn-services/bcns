/**
 * seed-gtm.ts — import of the GTM tracks (board cards in `tracks`), their steps (tasks,
 * source='tracker') and lists (list_items) from scripts/seed-gtm.json. Idempotent: a rerun adds
 * only what is missing (tracks by name, list items only if none exist) and back-fills track_id on
 * tracker tasks seeded before tracks existed.
 *
 *   tsx scripts/seed-gtm.ts            dry run: prints what it would insert, touches nothing
 *   tsx scripts/seed-gtm.ts --apply    signs in with the anon key and HQ_SEED_EMAIL / HQ_SEED_PASSWORD
 *                                      (typed by Nate, process env only), then writes.
 * Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY. No service-role key, ever.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  AREAS,
  LISTS,
  LIST_STATUSES,
  assertOwner,
  buildTaskRow,
  statusPatch,
  type ListName,
  type ListStatus,
  type NewTask,
} from "../lib/tasks";
import { COLUMNS, type Column } from "../lib/tracks";

export interface SeedStep {
  title: string;
  owner: string;
  status: string;
  due?: string;
  waiting_on?: string;
}
export interface Seed {
  /** column: optional override; else all steps done -> done, all open steps waiting -> wait, "(later)" in the name -> next, else now. */
  tracks: { area: string; name: string; column?: Column; steps: SeedStep[] }[];
  lists: Record<string, { business: string; status?: string; notes?: string }[]>;
}

function trackColumn(t: Seed["tracks"][number]): Column {
  if (t.column) {
    if (!COLUMNS.includes(t.column)) throw new Error(`bad column ${t.column}`);
    return t.column;
  }
  const open = t.steps.filter((s) => s.status !== "done");
  if (t.steps.length && !open.length) return "done";
  if (open.length && open.every((s) => s.status === "waiting")) return "wait";
  return /\(later\)/i.test(t.name) ? "next" : "now";
}

/** Validated rows to insert; throws on a bad owner, area, status, column or list. */
export function planSeed(seed: Seed) {
  const tracks = seed.tracks.map((t) => {
    if (!AREAS.includes(t.area as (typeof AREAS)[number]))
      throw new Error(`unknown track ${t.area}`);
    const column = trackColumn(t);
    return { name: t.name, area: t.area, column };
  });
  const tasks: (NewTask & { track: string })[] = seed.tracks.flatMap((t) => {
    return t.steps.map((s) => ({
      track: t.name,
      title: s.title,
      owner: assertOwner(s.owner),
      area: t.area,
      status: statusPatch(s.status, new Date()).status,
      due: s.due ?? null,
      waitingOn: s.waiting_on ?? null,
      source: "tracker" as const,
    }));
  });
  const items = Object.entries(seed.lists).flatMap(([list, rows]) => {
    if (!LISTS.includes(list as ListName)) throw new Error(`unknown list ${list}`);
    return rows.map((r, sort) => {
      const status = (r.status ?? "todo") as ListStatus;
      if (!LIST_STATUSES.includes(status)) throw new Error(`bad list status ${status}`);
      // business names only: who stays null
      return { list, business: r.business, status, notes: r.notes ?? null, who: null, sort };
    });
  });
  return { tracks, tasks, items };
}

type Row = { id: string; name?: string; title?: string; track_id?: string | null };

/** Dry run when `sb` is null (prints only). With a client + actor: adds what is missing, so a rerun is a no-op. */
export async function seedGtm(
  sb: SupabaseClient | null,
  actor: string,
  seed: Seed,
  log: (line: string) => void = console.log
): Promise<{ tracks: number; tasks: number; items: number }> {
  const { tracks, tasks, items } = planSeed(seed);
  log(
    `seed-gtm${sb ? " --apply" : " (dry run)"}: ${tracks.length} tracks, ${tasks.length} tasks (source=tracker), ${items.length} list items`
  );
  for (const t of tracks) log(`  track ${t.area}: ${t.name} [${t.column}]`);
  for (const t of tasks)
    log(`  task  ${t.area}: ${t.title} [${t.owner}, ${t.status}${t.due ? `, due ${t.due}` : ""}]`);
  for (const i of items) log(`  list  ${i.list}: ${i.business} [${i.status}]`);
  if (!sb) {
    log("dry run: nothing inserted. Re-run with --apply (HQ_SEED_EMAIL, HQ_SEED_PASSWORD in env).");
    return { tracks: tracks.length, tasks: tasks.length, items: items.length };
  }
  const read = async (table: string, cols: string, filter?: [string, string]) => {
    let q = sb.from(table).select(cols);
    if (filter) q = q.eq(filter[0], filter[1]);
    const r = await q.limit(1000);
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    return (r.data ?? []) as unknown as Row[];
  };
  const now = new Date();
  // tracks: add the missing ones by name (one insert), then map every name to its id
  const haveTracks = await read("tracks", "id, name");
  const missing = tracks.filter((t) => !haveTracks.some((h) => h.name === t.name));
  const idByName = new Map(haveTracks.map((h) => [h.name, h.id]));
  if (missing.length) {
    const r = await sb
      .from("tracks")
      .insert(
        missing.map((t) => ({ ...t, done_at: t.column === "done" ? now.toISOString() : null }))
      )
      .select("id, name");
    if (r.error) throw new Error(`tracks insert: ${r.error.message}`);
    for (const row of (r.data ?? []) as Row[]) idByName.set(row.name, row.id);
  }
  // tasks: first run inserts all in ONE statement (a failure leaves none); a run that creates tracks over existing tasks back-fills track_id; any other rerun changes nothing
  const haveTasks = await read("tasks", "id, title, track_id", ["source", "tracker"]);
  let inserted = 0;
  let linked = 0;
  if (!haveTasks.length) {
    const ins = await sb
      .from("tasks")
      .insert(tasks.map((t) => buildTaskRow(actor, "job", { ...t, trackId: idByName.get(t.track) }, now)));
    if (ins.error) throw new Error(`tasks insert: ${ins.error.message}`);
    inserted = tasks.length;
  } else if (missing.length) {
    // Only the run that creates the tracks back-fills: a later rerun must not re-link a step someone unlinked.
    for (const t of tasks) {
      const ids = haveTasks
        .filter((h) => h.title === t.title && !h.track_id)
        .map((h) => h.id);
      if (!ids.length) continue;
      const r = await sb.from("tasks").update({ track_id: idByName.get(t.track) }).in("id", ids);
      if (r.error) throw new Error(`tasks link: ${r.error.message}`);
      linked += ids.length;
    }
  }
  let itemCount = 0;
  if (items.length && !(await read("list_items", "id")).length) {
    const r = await sb.from("list_items").insert(items);
    if (r.error) throw new Error(`list_items: ${r.error.message}`);
    itemCount = items.length;
  }
  if (missing.length || inserted || linked || itemCount) {
    const e = await sb.from("events").insert({
      job: "hq",
      kind: "seed.gtm",
      detail: { tracks: missing.length, tasks: inserted, linked, items: itemCount },
      actor,
      via: "job",
    });
    if (e.error) throw new Error(`events: ${e.error.message}`);
  }
  log(
    `inserted ${missing.length} tracks, ${inserted} tasks, ${itemCount} list items; linked ${linked} existing tasks to tracks`
  );
  return { tracks: missing.length, tasks: inserted, items: itemCount };
}

async function main() {
  const seed = JSON.parse(
    readFileSync(join(dirname(process.argv[1] ?? "."), "seed-gtm.json"), "utf8")
  ) as Seed;
  if (!process.argv.includes("--apply")) {
    await seedGtm(null, "", seed);
    return;
  }
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon } = process.env;
  const { HQ_SEED_EMAIL: email, HQ_SEED_PASSWORD: password } = process.env;
  if (!url || !anon || !email || !password)
    throw new Error(
      "set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, HQ_SEED_EMAIL, HQ_SEED_PASSWORD"
    );
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("sign-in failed");
  await seedGtm(sb, data.user.id, seed);
}

if (process.argv[1]?.endsWith("seed-gtm.ts")) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
