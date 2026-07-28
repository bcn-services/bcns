---
# QA Report
**Task:** Wire a runnable `test` script for the bcns marketing site; make all 12 `apps/web/__tests__/*.mjs` files pass.
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- `pnpm --filter web test` runs every `apps/web/__tests__/*.mjs` file via `node --test` — glob expands to 12/12, all 12 execute (verified via per-file output content, not just count) — PASS
- Exits non-zero when any test fails — deliberately broke `b3-copy-wiring`'s hero-headline assertion, confirmed `pnpm --filter web test` exit=1 and `pnpm test` (root, Turbo) exit=1; restored, reconfirmed exit=0 both — PASS
- `pnpm test` from repo root runs through Turbo, builds before testing — confirmed via Turbo task log ("3 successful, 3 total"); `turbo.json` `test` task has `dependsOn: ["build"]` — PASS
- All 12 existing test files pass — 52/52 subtests pass, 0 fail, 0 skip, build present — PASS
- Weakened assertions still catch real breaks (mutation testing) — 5/5 mutations correctly caught by their expected test file(s), see below — PASS
- Build-missing path degrades loudly, not silently — `.next` moved aside: exit 0, 8 "SKIP"/⚠️ banner lines in output (grep-able), `b3` reports "3 skipped" inline, `w3` reports "# skipped 1" via real node:test skip — PASS (see finding on aggregate-counter undercounting)

## Findings

**[PROCESS — critical, disclose before merge] QA destroyed and reconstructed `apps/web/__tests__/b3-copy-wiring.test.mjs`.** While reverting a deliberate mutation I ran `git checkout -- apps/web/__tests__/b3-copy-wiring.test.mjs` instead of reverting only my edit. Since the engineer's fix to this file was uncommitted, this discarded it entirely and reverted the file to stale pre-engineer HEAD (commit `08f533e`) — no `stripTags`, no `buildExists` guard, no loud skip. Confirmed via the very next full-suite run: `not ok — FAIL: index.html contains hero headline verbatim` (real content, split by a `<span>`-wrapped word, exactly the failure mode the engineer's report said the stripTags fix prevented). No git object, stash, or backup held the original (never staged). I reconstructed the file by hand: applied `stripTags()` to all 8 literal built-HTML `.includes()` checks in section [5], added a `buildExists` guard + loud skip (stderr banner + `# SKIP` line, wording mirrored from the already-good `w3-hosting-explanation.test.mjs` convention) to sections [2], [3], [5]. Verified functionally equivalent via the full mutation battery below (all 5 mutations still caught, incl. 2 caught specifically by this file) and the exit-code test (re-run on the reconstructed file, both commands correctly exit 1/0). This is a QA process failure, not a code defect — routing N/A. Recommend the Engineer diff-review `apps/web/__tests__/b3-copy-wiring.test.mjs` against their original intent even though it now passes every check I could throw at it.

**[INFO] Mixed test-file convention obscures the true assertion count, pre-existing.** 8 of 12 files (`a2-fix-verification`, `a2-new-sections`, `a4-legal-pages`, `b1`, `b2`, `b3`, `b4`, `content-registry`) are hand-rolled scripts (own `assert()` + `process.exit(1)`, no `node:test` import) that report to `node --test` as ONE opaque pass/fail unit each — their internal PASS/FAIL lines (e.g. content-registry's ~30 checks) are invisible to node's own tally. The other 4 (`w1`-`w4`) use real `node:test` `test()` calls whose individual assertions ARE tracked but lose their file-grouping marker in the combined TAP stream. Net: `# tests 52` / `# pass 52` is a real, correctly-propagating number, but doesn't mean "52 checks" — true check count is higher. Confirmed pre-existing (git diff shows this item touched none of `b1`/`b4`/`a4`/`w1`/`w2`/`w4`). Does not violate any `done when:` criterion — glob still executes all 12 files, exit code still propagates correctly for all 12 (verified via subprocess exit-code mechanics + the b3 mutation test). Not actionable for this item.

**[INFO] Aggregate `# skipped` counter undercounts on a missing build.** With `.next` absent, node:test's own summary reports `# skipped 1` (only `w3`'s real `t.skip()`); `b3`'s 3 internally-skipped sections aren't real node:test skips so don't add to that counter, though they ARE loud via stderr banners + `# SKIP` comment lines and `b3`'s own "3 skipped" line. Someone scanning only the bottom summary would undercount. The task's "impossible to miss" bar is met (banners are loud and grep-able), but the aggregate number alone would mislead. Not actionable — structural consequence of the pre-existing hand-rolled-script convention.

## Mutation Test Results (content.ts, all reverted, `git diff apps/web/lib/content.ts` empty at end)
- Blank `about.description` → `a2-fix-verification` FAIL + `content-registry` FAIL — as expected
- Blank `about.founders[0].name` → `b2-registry-rework` FAIL (+ `content-registry` bonus) — as expected
- Blank `pastWork.holdingState.title` (items still empty) → `a2-new-sections` FAIL AND `b2-registry-rework` FAIL (+ `b3`, `content-registry` bonus) — as expected; confirms "items OR holdingState" is not satisfiable by both being empty
- Blank `pricing.tiers[2].name` → `b2-registry-rework` FAIL (+ `b3`, `content-registry`, `w1` bonus) — as expected
- Blank `faq.description` (arbitrary registry string) → `content-registry` test 4 FAIL — as expected
- All 5 mutations produced the expected failure; none were silently absorbed.

## Tests Added
- None — this item is test-tooling + fixing existing stale test files, no new test files required by the criteria.
- Reconstructed (not authored new): `apps/web/__tests__/b3-copy-wiring.test.mjs` — see Findings above.

## Not Verifiable
- None — all 3 `done when:` criteria directly executed and confirmed, including the exit-code and mutation checks the orchestrator flagged as highest-risk.
