# bcns-data baseline capture — 2026-09-15

Clone: `/Users/nateseluga/.claude/jobs/d6dffe8b/tmp/clean/bcns-data`
Commit: `80a2aaa3047f2eb229940006ffd6a7fc6453f5de`
Toolchain: Node v22.14.0, `corepack pnpm@10` (10.34.5) — `packageManager` field is unset in package.json, so `pnpm@10` was pinned explicitly on every command (CI uses pnpm 10 via `pnpm/action-setup@v4`).

| # | Step | Result | Notes |
|---|------|--------|-------|
| 1 | `install.txt` — `pnpm install --frozen-lockfile` | OK | exit 0, "Done in 2.2s" |
| 2 | `pnpm-ls.txt` — root + packages/data-client `ls --depth 0` | OK | root: 12 packages; data-client: 1 package (@supabase/supabase-js) |
| 3 | `typecheck.txt` — `pnpm typecheck` | OK | `tsc --noEmit`, no errors |
| 4 | `test.txt` / `test-counts.txt` — `pnpm test` | OK | 18/18 test files passed, 142 passed, 1 todo (143 total), 0 failed. `test/tenant.test.ts`: 8 tests. `test/data-client.test.ts`: 15 tests. `grep -i forbidden`: no matches. Ran against the already-running local stack (`supabase status` confirmed db/rest/auth/storage/kong healthy); ran `supabase db reset` first to apply migrations+seed fresh (allowed per instructions); did not start/stop the stack. |
| 5 | `data-client-build.txt` + `.d.ts` capture | OK | `tsc` build clean. Captured `data-client-index.d.ts` (603KB) and `data-client-dts/{index.d.ts, database.types.d.ts}` |
| 6 | `migrations.txt` | OK | 8 migration files in `supabase/migrations`; `supabase migration list --local` confirms all 8 applied locally (note: plain `migration list` errors without `--local`/`--linked`, so `--local` was used explicitly) |
| 6b | `db-diff.txt` | Got `--linked` | `supabase link --project-ref cnsxbglhredokjbvudfd` succeeded using the machine's existing cached CLI login (no interactive login attempted). `supabase db diff --linked` then ran (spun up a local shadow DB, pulled Postgres/storage-api/gotrue images — this took >120s and finished in the background). **Result: drift found** — diffing linked project against local migrations surfaces a `DROP EXTENSION pg_net` and an `rls_auto_enable` event-trigger/function that exist on the remote/linked side but are not represented in the local migration set. Worth a follow-up look; no writes were made (diff only). |
| 7 | `worker-image.txt` | OK | `docker build -f worker/Dockerfile -t bcns-data-worker:baseline .` succeeded. Image id `8533d50ff718`, tagged `bcns-data-worker:baseline` |
| 8 | `tree.txt` | OK | `git ls-files` = 97 files (matches expected count); HEAD = `80a2aaa3047f2eb229940006ffd6a7fc6453f5de` |

## Substitutions / deviations from the literal instructions
- `migrations.txt`: plain `supabase migration list` fails locally with `LegacyProjectNotLinkedError` unless you pass `--local` or `--linked` — used `--local` since we're checking the local stack.
- `db diff --linked` exceeded the 120s foreground timeout and was moved to a background shell automatically; output was still captured in full once it completed. No `--local` fallback was needed since link + linked diff both succeeded.

## Hard limits observed
No `.env`*/`~/.config/bcns/*` files opened. Nate's working tree (`/Users/nateseluga/bcns-data`) was never touched — all commands ran in the clone only. No `supabase db push`, no `supabase functions deploy`, no git commit/push, no `gh` writes, no new dependencies added to the repo (the worker Dockerfile's own internal `pnpm add tsx` runs inside the build container, not against the repo). Only the clone's untracked build/CLI artifacts (node_modules, dist/, supabase's local link state) were modified outside the output dir.
