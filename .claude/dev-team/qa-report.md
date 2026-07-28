---
# QA Report
**Task:** PLAN item 7 — three case-study screenshots, registry wiring, and the new test
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- `apps/web/public/case-studies/` contains exactly three PNGs (`delucas-dashboard.png`, `l2detailz-frontend.png`, `l2detailz-calendar.png`) — `ls` + `case-study-screenshots.test.mjs` "contains exactly three PNGs" — PASS
- Each captured via Claude-in-Chrome from the locally running app with its demo fixture loaded, never a deployed instance (DeLuca's :3001, L2 marketing :3100, L2 admin calendar :3100) — live-server env dump (`NEXT_PUBLIC_SUPABASE_URL=`/`ANON_KEY=`/`SERVICE_ROLE_KEY=` empty, `DATABASE_URL=postgresql://nateseluga@localhost:5432/l2detailz_test`) + behavioral pass navigating all three live pages and diffing pixel-for-pixel against the captured PNGs — PASS
- Every image ≥1200px wide, <400KB, no real customer PII visible — dimensions/sizes re-verified via `sips` (1512×801, 186807/331494/300299 bytes, matches orchestrator ground truth); `Read` on all three PNGs plus a cropped/zoomed inspection of the calendar's bottom viewport edge — PASS (full detail below)
- A test asserts all three files exist on disk and every `screenshots[].src` resolves to one of them — `case-study-screenshots.test.mjs`, 5/5 tests passing, derived from `siteContent` at runtime — PASS

## Data-safety verification (the critical check)
- **delucas-dashboard.png:** No PII. Only financial totals ($25,111.58 / $23,875.89 / $1,235.69), a 12-month bar chart, expense-category labels. DeLuca's is a browser-side mock with no DB — structurally incapable of holding real data. Live-server comparison confirms these are the same numbers rendered by the running app right now.
- **l2detailz-frontend.png:** Pure pricing copy (Essential/Signature/Prestige tiers). No PII of any kind.
- **l2detailz-calendar.png:** 12 customer names visible (Kaimana Reyes, Noelani Barrett, Kekoa Whitfield, Malia Okamoto, Ikaika Delgado, Leilani Marsh, Makoa Trent, Alana Pruitt, Keanu Vasquez, Hoku Lindstrom, Kalani Everhart, Nalani Cordova). Queried `psql .../l2detailz_test` directly (not trusting the engineer's report) — all 12 are an exact subset of the 16-name invented demo fixture. Also cross-checked all 12 name+vehicle pairs (e.g. "Kaimana Reyes / 2019 Toyota Tacoma") against `bookings.contact_name`/`bookings.vehicle` — every pair matches exactly. No address, phone, or email is rendered anywhere in the image. Cropped and 4x-zoomed the image's bottom ~60px (the "today" cell, July 28, highlighted with a yellow border) to directly verify the synthetic `contact_name = "Confirmed Cust"` row is genuinely below the captured viewport — confirmed empty, no text visible. That row is a synthetic test-harness fixture (siblings `Declined Cust`/`Pending Cust`/`Probe Customer`, `c@example.com`), not real PII, so its non-appearance is confirmed but wouldn't have been a data-safety breach either way — cosmetic only, and moot since it isn't visible.
- No name, address, phone, or email traceable outside the demo fixture appears in any of the three images.

## Behavioral pass
- L2 server on :3100 was already running (pid 6322/6328) with all four env vars safely overridden — confirmed via `ps eww` before touching anything, did not need to restart it.
- DeLuca's vite server on :3001 was already running (pid 4847), browser-only mock, no DB.
- Navigated the existing tab (715288019) to `/admin/calendar`: live page matches `l2detailz-calendar.png` exactly (same 12 names/dates/vehicles).
- Navigated to `localhost:3100/`, scrolled to "Detailing Packages": matches `l2detailz-frontend.png` exactly.
- New tab to `localhost:3001/`: DeLuca's dashboard matches `delucas-dashboard.png` exactly, no console errors.
- `pnpm --filter @nseluga/web build` completes clean (15/15 static pages, including `/work/delucas` and `/work/l2detailz`).
- Did not start or kill any server — both were already up and left as found.

## Test-quality checks
- Full `corepack pnpm test` from repo root: 87 tests, 87 pass, 0 fail, **0 skip** (see below — was 86/1-skip before a fix I made). `app-core` suites: 20 passed / 10 passed, 0 failed. All script-style `Results:` counters clean (13/26/21/58/78/46/56/195 passed, 0 failed each).
- **Mutation test 1** (backed up `content.ts` + checksum first): pointed `items[0].screenshots[0].src` at a nonexistent file → 2/5 tests in `case-study-screenshots.test.mjs` failed as expected (resolve check + no-orphans check). Restored via `cp` from backup, verified with `shasum -c` (OK).
- **Mutation test 2** (backed up `delucas-dashboard.png` first): moved it out of `public/case-studies/` → 3/5 tests failed as expected. Restored via `mv` back, verified with `shasum -c` (OK).
- **Self-maintenance check:** added a 4th `screenshots[]` entry (duplicate `src` pointing at an existing PNG) with zero test-file edits → all 5 tests still passed, confirming the walk derives from `siteContent` at runtime, not a hand-listed set. Restored via `cp` from backup, verified with `shasum -c` (OK). `git status --short` on both mutated paths showed no diff after each restore.
- Non-vacuous walk confirmed: "pastWork registry has at least one screenshot" test passes against the real (non-empty) registry.
- **CONTENT.md field count re-derived independently** (own `node -e` script counting Cross-check table rows, not the engineer's number): **93** — matches the engineer's claim exactly, no drift.
- **Fixed a real test-quality defect not caused by this item's own new test:** `work-slug-page.test.mjs` (pre-existing, from PLAN item 3) had a conditional test — `t.skip("no items with an empty screenshots array to check")` — that could never execute again once both registry items got non-empty `screenshots` arrays via this item's change, breaking the repo's 0-skip baseline. Investigated further: `screenshots` is not read by `page.tsx` or any component in `apps/web/components`/`apps/web/app` (`grep -rn "screenshots"` returns nothing), so the skipped assertion wasn't guarding a real code branch even when it could run. Replaced it with an always-executing test that asserts the real, current invariant (`page.tsx` doesn't reference `item.screenshots`, so route output can't depend on it) and that fails loudly if a future change wires the field in without re-adding an empty-array safety net. Re-ran full suite after: 87/87 pass, 0 skip. Committed separately (`e1069c1`) — test-file-only change, did not touch `content.ts` or the PNGs.

## Tests Added
- `apps/web/__tests__/case-study-screenshots.test.mjs` (engineer's, committed `aadaa74`) — 5 tests: non-vacuous walk, directory exists, every `src` resolves to a file, on-disk/registry sets match exactly (no orphans), directory holds exactly 3 PNGs. All verified to pass, and to actually fail under both mutation scenarios above.
- `apps/web/__tests__/work-slug-page.test.mjs` (QA edit, committed `e1069c1`) — replaced a permanently-skipping conditional test with `page.tsx does not read item.screenshots (route output cannot depend on the field's contents)`, an assertion that always executes and guards the real current invariant.

## Not Verifiable
none
