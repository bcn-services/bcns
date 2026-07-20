# Baseline — model-migration run (READ FIRST)

Session worktree: `/Users/nateseluga/bcns/.claude/worktrees/mm-run`
Branch: `dev-team/model-migration-run` (forked from `worktree-model-migration` @ 40cfb15, == main).
**Do NOT create a new worktree.** cd into the path above and work there.

## How to run things (turbo root scripts are BROKEN here)
- Root `pnpm lint`/`pnpm typecheck` fail with turbo "cannot find binary path". **Run per-package instead.**
- Web app lives in `apps/web`. From there:
  - Lint: `corepack pnpm lint`  · Typecheck: `corepack pnpm typecheck`  · Build: `corepack pnpm build`
  - Tests: **`node --experimental-strip-types --test __tests__/*.mjs`** (tests import `.ts`; the strip-types flag is REQUIRED; there is no `test` npm script).
- Root build of just web: `corepack pnpm --filter web build` (works).

## Pre-existing test baseline (node --experimental-strip-types --test)
As of run start, on untouched branch:
- PASS: a4-legal-pages, b1-multi-page-routing, b3-copy-wiring, b4-content-md
- FAIL (STALE — pre-existing, assert an older registry shape, e.g. `'eyebrow' in undefined`):
  a2-fix-verification, a2-new-sections, b2-registry-rework, content-registry

**Gate rule:** the 4 PASSING files must stay green (no new regressions). The 4 FAILING
files are pre-existing failures — an item is not blocked by them UNLESS its own
`done when:` names them. If your content.ts change happens to fix one, good; do not
spend attempts resurrecting stale tests outside your item's scope.

## Voice / content rules (W-series)
- content.ts is the single source of truth; `apps/web/CONTENT.md` mirrors it 1:1.
- No em-dashes (`—`); en dashes only inside numeric ranges. No buzzwords, no "SaaS", no "we help".
- **Use Python for Unicode/en-dash exact-string checks** — shell grep silently mismatches en-dashes
  (prior-run lesson). `apps/web/scripts/readability-check.py` exists for FK grade checks.
- No invented facts (no fake clients/quotes/metrics).
