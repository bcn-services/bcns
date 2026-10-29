/**
 * seed-tracks.ts — inserts any missing FIXED_TRACKS rows (column `now`). Idempotent by name.
 *
 *   tsx scripts/seed-tracks.ts            dry run: prints what it would insert, touches nothing
 *   tsx scripts/seed-tracks.ts --apply    signs in with the anon key and HQ_SEED_EMAIL / HQ_SEED_PASSWORD
 *                                         (typed by Nate, process env only), then writes.
 * Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY. No service-role key, ever.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXED_TRACKS, FIXED_TRACK_DESC } from "../lib/tracks";

/** Dry run when `sb` is null. With a client: inserts the missing names in one statement; returns the count. */
export async function seedTracks(
  sb: SupabaseClient | null,
  actor: string,
  log: (line: string) => void = console.log
): Promise<number> {
  log(`seed-tracks${sb ? " --apply" : " (dry run)"}: ${FIXED_TRACKS.length} fixed tracks`);
  for (const n of FIXED_TRACKS) log(`  track ${n} [now]: ${FIXED_TRACK_DESC[n]}`);
  if (!sb) {
    log("dry run: nothing inserted. Re-run with --apply (HQ_SEED_EMAIL, HQ_SEED_PASSWORD in env).");
    return 0;
  }
  const have = await sb.from("tracks").select("name").limit(1000);
  if (have.error) throw new Error(`tracks: ${have.error.message}`);
  const names = new Set((have.data ?? []).map((r: { name: string }) => r.name));
  const missing = FIXED_TRACKS.filter((n) => !names.has(n));
  if (missing.length) {
    const r = await sb
      .from("tracks")
      .insert(missing.map((name) => ({ name, column: "now", done_at: null })));
    if (r.error) throw new Error(`tracks insert: ${r.error.message}`);
    const e = await sb.from("events").insert({
      job: "hq",
      kind: "seed.tracks",
      detail: { tracks: missing },
      actor,
      via: "job",
    });
    if (e.error) throw new Error(`events: ${e.error.message}`);
  }
  log(`inserted ${missing.length} tracks`);
  return missing.length;
}

async function main() {
  if (!process.argv.includes("--apply")) {
    await seedTracks(null, "");
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
  await seedTracks(sb, data.user.id);
}

if (process.argv[1]?.endsWith("seed-tracks.ts")) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
