---
# Engineer Report
**Task:** Extend `PastWorkItem` with case-study detail fields (slug/problem/approach/outcome/screenshots), mirror in CONTENT.md, seed `delucas`+`l2detailz` slots
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27

## Design Decisions
- `PastWorkItem` gained `slug, problem, approach, outcome, screenshots: ScreenshotItem[], link?` (order per spec) — new `ScreenshotItem { src, alt, caption }` interface added alongside it.
- `screenshots` ships `[]` on both entries — placeholder `src` would point at a nonexistent file and break a later plan item that hard-fails the build on missing screenshot assets.
- `link` omitted (not placeholder'd) on both entries — it's optional and `past-work.tsx` renders `{link}` as visible anchor text, so a placeholder href would render a broken link.
- `title/problem/approach/outcome` all ship as `[INPUT: …]` on both real clients (DeLuca's, L2 Detailz) — never drafted copy, per the anti-fabrication constraint; only `slug` is a literal value (prescribed verbatim).
- `past-work.tsx` hardened `key={workTitle}` → `key={slug}` (optional recommended change) since slug uniqueness is now test-guaranteed and title placeholders alone were a weaker key; `workTitle` stays in the destructure for CardTitle rendering.

## Files Changed
- `apps/web/lib/content.ts` — added `ScreenshotItem`, extended `PastWorkItem`, seeded `pastWork.items` with `delucas`/`l2detailz` placeholder entries.
- `apps/web/components/past-work.tsx` — destructure adds `slug`; `key={workTitle}` → `key={slug}`.
- `apps/web/CONTENT.md` — new field docs for slug/problem/approach/screenshots(+src/alt/caption); updated "Adding work" blockquote shape; updated cross-check table (+7 rows, total 80→87 with arithmetic spelled out); updated Needs-Nate table (+8 new `[INPUT:]` slots, fixed stale "empty arrays" claim — `pastWork.items` no longer empty, `reviews.items` still is); bumped `_Last updated:_`.
- `apps/web/__tests__/b2-registry-rework.test.mjs` — L192 rewritten: asserts `holdingState.title` stays populated instead of `items.length === 0` (items is now seeded); `reviews.items` empty-check left unchanged.
- `apps/web/__tests__/a2-new-sections.test.mjs` — widened `SLOT_RE` to `/\[(SLOT|INPUT):/` so seeded `[INPUT:]` items pass; heading/comment updated; reviews loop left vacuous/unchanged.
- `apps/web/__tests__/b4-content-md.test.mjs` — `fieldNames` gained `slug, problem, approach, screenshots, src, alt, caption` so the 1:1 mirror is actually enforced.
- `apps/web/__tests__/past-work-case-studies.test.mjs` (new) — 10 tests: exact count/slugs, uniqueness, `^[a-z0-9-]+$` regex, per-field `^\[INPUT: .+\]$` anti-fabrication regex on title/problem/approach/outcome, screenshots array + shape check.
- `apps/web/__tests__/a2-fix-verification.test.mjs` — verified only, no edit needed (link omitted takes the passing `else` branch).

## Deferred / Out of Scope
- Screenshot files/paths — later plan item, intentionally left as `[]`.
- Real title/problem/approach/outcome copy — Needs-Nate, cannot be drafted (real clients).
- `link` field — not added; no real project URL to point at yet.

## Flags for Reviewer
- None new — no hot paths, DB, or external calls touched; this is a static content-registry + doc change.
- `/work` now renders the item grid (not holding state) showing literal `[INPUT: …]` text — expected/intended per plan, not a bug.

## Verification
- `corepack pnpm typecheck` (apps/web) — clean.
- `corepack pnpm --filter @nseluga/web typecheck` (repo root) — clean.
- `corepack pnpm --filter @nseluga/web test` — 62/62 pass, 0 fail, 0 skip (build present from prior run).
- Mutation tests (cp-backup + shasum -c restore, never `git checkout --`):
  - Duplicate slug (`l2detailz`→`delucas`) → tests 2 & 3 in new file FAIL as expected; restored, verified OK.
  - Invalid-case slug (`delucas`→`DeLucas`) → test 4 (regex) FAILs as expected; restored, verified OK.
  - Invented outcome prose (`"Cut booking time 40%"`) → both `a2-new-sections` widened check AND new file's anti-fabrication test FAIL as expected; restored, verified OK.
