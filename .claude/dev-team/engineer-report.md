---
# Engineer Report
**Task:** Wire a runnable `test` script for the bcns marketing site; make all 12 `apps/web/__tests__/*.mjs` files pass.
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27

## Design Decisions
- `apps/web/package.json` `test` script runs `node --experimental-strip-types --test __tests__/*.mjs` — matches the existing hand-run command exactly, no new tooling.
- `turbo.json` `test` task has `dependsOn: ["build"]` + `cache: false` — build is a genuine prerequisite (b3/w3 assert against `.next/server/app/*.html`); no-cache so a stale green can never mask a real failure (suite runs <1s, nothing to gain from caching).
- Root `package.json` `test` → `turbo run test`, so `pnpm test` fans out to every package with a test task (also ran `@nseluga/app-core`'s existing suite, unaffected).
- Did NOT add `"type": "module"` to `apps/web/package.json` — would break the CJS `postcss.config.js`/`tailwind.config.js` the Next build needs.
- b3/w3 build-output checks degrade to a loud skip (stderr banner + visible `# SKIP` in TAP output) when `.next/server/app/` is absent, so a bare `pnpm --filter web test` on a clean tree stays green for the right reason; `pnpm test` via Turbo always builds first so the real gate is unaffected.

## Files Changed
- `apps/web/package.json` — added `test` script.
- `package.json` — added root `test` → `turbo run test`.
- `turbo.json` — added `test` task (`dependsOn: build`, `cache: false`).
- `apps/web/__tests__/content-registry.test.mjs` — dropped `problemSolution`/`deliveryModels` from REQUIRED_KEYS, SECTION_REQUIRED_FIELDS, tuple-length asserts; weakened `isAllowedStringValue` (see below).
- `apps/web/__tests__/a2-fix-verification.test.mjs` — re-pointed `aboutFounder.description` → `about.description`; deleted cardTitleBio/cardTitleCredentials checks (no successor).
- `apps/web/__tests__/a2-new-sections.test.mjs` — re-pointed `aboutFounder` → `about`/`about.founders[]`; replaced items>=1 checks; re-pointed nav-anchor check to page routes (found empirically, not in the pre-supplied failure list — masked by an earlier crash).
- `apps/web/__tests__/b2-registry-rework.test.mjs` — weakened 5 SLOT-placeholder asserts to non-empty-string asserts (real copy landed).
- `apps/web/__tests__/b3-copy-wiring.test.mjs` — stripped HTML tags before all 6 built-HTML literal checks (span-wrap fragility); added loud build-missing skip to all 3 build-dependent sections.
- `apps/web/__tests__/w3-hosting-explanation.test.mjs` — build-dependent test now `t.skip()`s loudly (stderr + TAP `# SKIP`) instead of failing when `.next/server/app/` is absent.

## Coverage changes (every delete/weaken, per instructions)
- content-registry: deleted `problemSolution`/`deliveryModels` — removed in B2/B3, intentional, no successor.
- content-registry test 4: weakened SLOT-or-step-number invariant → non-empty-string invariant. Found empirically (not in the given failure list — masked by an earlier crash): real copy landed everywhere, so the original invariant fails on 133 legitimate content strings. Preserves the "no field ships empty" guarantee.
- a2-fix-verification: deleted `aboutFounder.cardTitleBio`/`cardTitleCredentials` registry + wiring checks — no successor field/prop after B2's about-founder.tsx rework.
- a2-new-sections: replaced `pastWork.items>=1`/`reviews.items>=1` with "items non-empty OR holdingState populated" — both sections now render a holding state by design.
- a2-new-sections: re-pointed nav-anchor check (`#past-work` etc.) → page-route check (`/work`, `/pricing`, `/about`) — B1 replaced single-page anchor nav with multi-page routing. Found empirically, not in the given failure list.
- b2-registry-rework: weakened 5 "is a SLOT placeholder" asserts (founders[0/1].name, pastWork holdingState.title, tier-3 name/price) to "is a non-empty string" — real copy landed in B3.

## Deferred / Out of Scope
- Did not touch the vacuous `pastWork.items` SLOT-link loops in a2-fix-verification/a2-new-sections (items.length is 0, loop body never runs) — harmless, will resume being meaningful once items are seeded; not a failure today.
- Turbo root `lint`/`typecheck` remain broken per team-memory — out of scope, not touched.

## Flags for Reviewer
- None — pure test-file + tooling change, no product code touched, no new runtime paths.

## Verification
- `cd apps/web && node --experimental-strip-types --test __tests__/*.mjs` → 12 files, 52 subtests, 0 failed, 0 skipped (build present in this worktree).
- `pnpm --filter web test` (repo root) → same result, exit 0.
- `pnpm test` (repo root, via Turbo) → builds first, then runs test task for web + app-core, exit 0.
- Deliberately broke `b3-copy-wiring`'s hero-headline assertion twice: confirmed `pnpm --filter web test` exits 1 (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`) and `pnpm test` (Turbo) exits 1 (`ELIFECYCLE`/`ERROR run failed`); restored both times, re-verified exit 0.
- Simulated missing build (`mv .next .next.bak`): b3 and w3 both skip loudly (stderr banner + `# SKIP <message>` in TAP output) and the overall run still exits 0; restored `.next`.
