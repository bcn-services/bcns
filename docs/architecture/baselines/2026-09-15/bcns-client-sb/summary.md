# Baseline capture — bcns-client-sb @ 6f3edee (2026-09-15)

Clone: `/Users/nateseluga/.claude/jobs/d6dffe8b/tmp/clean/bcns-client-sb` (read-only, never Nate's working tree). Node v22.14.0, `corepack pnpm` per `packageManager: pnpm@11.15.1`.

## Counts

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | OK — 213 packages, all reused from local store (0 downloaded). Non-fatal WARN (see Notes). |
| `pnpm ls --depth 0` | OK — 15 packages listed |
| `pnpm test` (DATA_SOURCE=shared) | 248 total / **247 pass** / 0 fail / 1 skipped |
| `pnpm test` (no env at all) | 248 total / 247 pass / 0 fail / 1 skipped — identical to above |
| `tests/rls-forbidden-read.test.mjs` (isolated) | 1 test, 0 pass, 0 fail, **1 skipped** (`Supabase env not configured — live RLS probe skipped`) |
| `tests/shared-mode.test.mjs` (isolated) | 8 tests, 8 pass, 0 fail, 0 skipped |
| `pnpm typecheck` | OK — clean (`tsc --noEmit`, no output) |
| `pnpm lint` | OK — clean (`eslint .`, no output) |
| `DATA_SOURCE=shared pnpm build` | OK — Next.js 14.2.18, compiled successfully, 6 routes |
| `output: 'standalone'` in next.config.mjs | **Yes** |
| `git ls-files` | **80 files** (not 81, see Notes) |
| HEAD | `6f3edee10a2f4c67bb575eb28b0417ace4eeceee` |

## Resolved versions (from `pnpm ls --depth 0`)

- `@bcn-services/app-core` → **0.2.0**
- `@bcn-services/data-client` → **0.2.0**
- `@supabase/ssr` → **0.12.7**

## Notes / discrepancies from doc expectations

- **Test count**: doc expects 247 tests. Actual node:test total is **248** (247 pass + 1 skip). The 247 figure matches the *pass* count, not the total. All failures = 0 in every run.
- **The one skip** is entirely inside `tests/rls-forbidden-read.test.mjs`: `rls: anon key cannot read arbitrary tables without a policy`, skipped because "Supabase env not configured — live RLS probe skipped." This accounts for the 248-vs-247 gap. `tests/shared-mode.test.mjs` is fully green (8/8).
- **Shared-mode env**: read `.github/workflows/deploy.yml` — the "Tests (shared-platform mode, no local stack)" step runs plain `pnpm test` with **no `env:` block**; `vars.DATA_SOURCE` gates the step's `if:` condition but is never exported into the step's environment. So a literal replay of that step is really the no-env run. Ran both (`DATA_SOURCE=shared` and no env at all) as instructed — outputs are byte-identical in pass/fail/skip counts.
- **`git ls-files` count**: got **80**, not the 81 named in the brief. Not investigated further (no source edits permitted); recorded verbatim as instructed.
- **npm/pnpm auth WARN**: every pnpm command printed `WARN Ignored project-level auth setting "//npm.pkg.github.com/:_authToken" ... environment variables are not expanded in registry credentials that come from a project .npmrc`. Did not affect any run here because the lockfile was already fully satisfied from the local pnpm store (0 packages downloaded) — worth flagging for a from-scratch CI/cache-miss install, where this WARN could become a real auth failure. GITHUB_TOKEN itself was never printed.
- No env files were opened. No `~/.config/bcns` files touched. No commits, pushes, `gh` writes, deploys, or supabase commands run. No source edited, no new dependencies added.

## Files in this baseline

install.txt, pnpm-ls.txt, test.txt, test-counts.txt, typecheck.txt, lint.txt, build.txt, routes.txt, tree.txt, summary.md
