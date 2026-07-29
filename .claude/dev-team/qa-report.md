---
# QA Report
**Task:** PLAN item 8 — render each case study's `screenshots[]` on `/work/[slug]` with `next/image`
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- 1. Each `/work/[slug]` renders `screenshots[]` via `next/image` with non-empty `alt` + caption below — checked via built-HTML `alt="…"` attribute match (entity-decoded) + `<figcaption>` text match, strict document-order verified (alt1<cap1<alt2<cap2 on l2detailz) — PASS
- 2. Below-fold lazy-load, zero `next/image` build warnings — checked via `grep -c loading="lazy"` (delucas=1, l2detailz=2, eager=0, fetchpriority="high"=0) + full-build grep for `warn|Warning|Image|sharp` (0 matches) — PASS
- 3. Missing-file / unregistered-src fails the build — mutation-proved both shapes, both directions (restore + shasum -c after each) — PASS
- 4. Visual system match (Reveal, rounded/bordered card treatment) + no overflow at mobile/desktop — checked live via Claude-in-Chrome (desktop) + structural proof (mobile, see below) — PASS
- 5. Median of 5 `/work/l2detailz` renders <1s — measured 0.002545/0.003037/0.003744/0.004630/0.008190s, median 0.003744s — PASS
- 6. Existing passing tests remain passing — 89 pass / 0 fail / 0 skip (was 88 pre-item-8, +1 for the new drift-gate test I added) — PASS

## Tests Added
- `apps/web/__tests__/work-slug-page.test.mjs` — added one test: derives `CASE_STUDY_IMAGES` map keys (regexed from `lib/case-study-images.ts` source text, since the suite runs under `node --experimental-strip-types` and can't import a module with static `.png` imports) and the registry's `screenshots[].src` set at runtime, asserts both non-empty and deep-equal. Closes the reverse-drift gap the engineer flagged: the build only catches registry→map drift (unregistered src throws at prerender); an orphan map entry with no registry reference previously built clean with no signal.
- Mutation-verified in both directions: bogus registry src → 1 test fails (16 pass/1 fail); restored (shasum -c OK) → 17/17 pass; orphan map key → 1 test fails again; restored (shasum -c OK) → 17/17 pass.
- Did not add new test infra — reused the existing `work-slug-page.test.mjs` file and its established `readFileSync`/`decodeEntities` conventions.

## Live Smoke (required, criterion 3/4/5 touch routes)
- Build + run: `corepack pnpm --filter @nseluga/web build` then `npx next start -p 3100` (real prod server, real dev build, no mocks). Server torn down by PID via `lsof -ti tcp:3100 | xargs kill`; port confirmed free after.
- `GET /work/delucas` → 200; `GET /work/l2detailz` → 200.
- All 3 registry screenshots: `alt="…"` attribute and (entity-decoded) `caption` text both present, each caption strictly below its own image's alt in document order.
- Optimizer endpoint hit for all 3 screenshots' actual emitted `srcSet` URLs (`/_next/image?url=…&w=640&q=75`): all 200, `Content-Type: image/png`, real non-trivial bytes (13.9KB/19.8KB/16.5KB) — no broken-image case.
- Browser check (desktop, live server): both figures carry `animate-fade-up` (post-intersection Reveal state, not `opacity-0`), image class exactly `h-auto w-full rounded-xl border border-border` matching the site's Card treatment. `document.documentElement.scrollWidth === clientWidth` (1470=1470) on both pages — no horizontal overflow. Console errors present are from unrelated Chrome extensions (`zotero.js`, `inject.js`), not the app.

## Mutation Proof — Criterion 3
- **Shape 1 (missing file):** removed `l2detailz-calendar.png` from `public/case-studies/` → build exit 1, `Module not found: Can't resolve '@/public/case-studies/l2detailz-calendar.png'`. Restored from `/tmp` backup, `shasum -c` OK, rebuild exit 0.
- **Shape 2 (unregistered src):** pointed `content.ts`'s delucas screenshot `src` at a path with no `CASE_STUDY_IMAGES` entry → build exit 1, `CaseStudyImageNotFoundError: No static import registered for case study screenshot "…". Add it to CASE_STUDY_IMAGES in lib/case-study-images.ts.` Restored, `shasum -c` OK, rebuild exit 0, zero build warnings on the clean tree.

## Regression Hygiene
- `content.ts` and `CONTENT.md`: `git diff HEAD~1 HEAD -- apps/web/lib/content.ts apps/web/CONTENT.md` = 0 lines — byte-identical to item 7's commit, `[INPUT: …]` captions untouched, no CONTENT.md change needed (no new fields).
- Working tree clean on all mutated files after every restore (`shasum -c` OK each time); only the new test-file diff was committed.

## Not Verifiable
- Mobile overflow was proved **structurally, not visually** — `resize_window` silently no-oped in this sandbox (`window.innerWidth` stayed 1470 after requesting 390x844; confirmed via JS read-back, a known environment artifact). Structural evidence: `<Image>` and its wrappers carry no fixed pixel widths (`h-auto w-full` → `max-w-2xl` → `Container`'s `w-full max-w-6xl px-6 lg:px-8`), `sizes="(min-width: 768px) 672px, 100vw"` degrades correctly below 768px, section root already carries `overflow-hidden`, and no breakpoint/grid classes were touched by this item. I did not perform and am not claiming a visual mobile check.
