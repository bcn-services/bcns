/**
 * seed-gtm.ts — one-time import of the GTM tracks (as tasks, source='tracker') and lists
 * (list_items) from scripts/seed-gtm.json.
 *
 *   tsx scripts/seed-gtm.ts            dry run: prints what it would insert, touches nothing
 *   tsx scripts/seed-gtm.ts --apply    signs in with the anon key and HQ_SEED_EMAIL / HQ_SEED_PASSWORD
 *                                      (typed by Nate, process env only), then inserts. Refuses when
 *                                      any tasks row with source='tracker' already exists.
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

export interface SeedStep {
  title: string;
  owner: string;
  status: string;
  due?: string;
  waiting_on?: string;
}
export interface Seed {
  tracks: { area: string; name: string; steps: SeedStep[] }[];
  lists: Record<string, { business: string; status?: string; notes?: string }[]>;
}

/** Validated rows to insert; throws on a bad owner, area, status or list. */
export function planSeed(seed: Seed) {
  const tasks: NewTask[] = seed.tracks.flatMap((t) => {
    if (!AREAS.includes(t.area as (typeof AREAS)[number]))
      throw new Error(`unknown track ${t.area}`);
    return t.steps.map((s) => ({
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
  return { tasks, items };
}

/** Dry run when `sb` is null (prints only). With a client + actor: refuses a second run, then inserts. */
export async function seedGtm(
  sb: SupabaseClient | null,
  actor: string,
  seed: Seed,
  log: (line: string) => void = console.log
): Promise<{ tasks: number; items: number }> {
  const { tasks, items } = planSeed(seed);
  log(
    `seed-gtm${sb ? " --apply" : " (dry run)"}: ${tasks.length} tasks (source=tracker), ${items.length} list items`
  );
  for (const t of tasks)
    log(`  task  ${t.area}: ${t.title} [${t.owner}, ${t.status}${t.due ? `, due ${t.due}` : ""}]`);
  for (const i of items) log(`  list  ${i.list}: ${i.business} [${i.status}]`);
  if (!sb) {
    log("dry run: nothing inserted. Re-run with --apply (HQ_SEED_EMAIL, HQ_SEED_PASSWORD in env).");
    return { tasks: tasks.length, items: items.length };
  }
  const seeded = await sb.from("tasks").select("id").eq("source", "tracker").limit(1);
  if (seeded.error) throw new Error(`tasks: ${seeded.error.message}`);
  if (seeded.data?.length)
    throw new Error("refusing: tasks with source='tracker' already exist (already seeded)");
  // one insert = one atomic statement: a failure leaves no tracker rows, so the refusal above can't wedge a rerun
  const now = new Date();
  const ins = await sb.from("tasks").insert(tasks.map((t) => buildTaskRow(actor, "job", t, now)));
  if (ins.error) throw new Error(`tasks insert: ${ins.error.message}`);
  if (items.length) {
    const r = await sb.from("list_items").insert(items);
    if (r.error) throw new Error(`list_items: ${r.error.message}`);
  }
  const e = await sb.from("events").insert({
    job: "hq",
    kind: "seed.gtm",
    detail: { tasks: tasks.length, items: items.length },
    actor,
    via: "job",
  });
  if (e.error) throw new Error(`events: ${e.error.message}`);
  log(`inserted ${tasks.length} tasks and ${items.length} list items`);
  return { tasks: tasks.length, items: items.length };
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
