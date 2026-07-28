---
# QA Report
**Task:** PLAN.md item 3 — `apps/web/app/work/[slug]/page.tsx` dynamic case-study route (final re-gate: h2 heading revert + dt-ui back-link/dividers pass)
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- `/work/delucas` → 200, `/work/l2detailz` → 200, `/work/nope` → 404 real Next body — PASS: live `next start -p 4173` (prod build), curl status codes exactly as specified; 404 body 11786B, "This page could not be found" (byte-identical to prior gate).
- Heading structure both slugs: exactly 1 `<h1>` (title), exactly 3 `<h2>` (labels), no skipped level — PASS: served HTML grep — 1×`<h1>[INPUT: <slug> case study title]</h1>`, 3×`<h2>` (The problem/Our approach/The outcome), 0×h3/h4/h5/h6 on both slugs.
- Back link is not a heading — PASS: the two `href="/work"` anchors on the page (nav + new back link) are plain `<a>` tags outside any h1–h6; confirmed via grep and RSC payload inspection.
- Back link works, real `next/link` anchor, valid href, keyboard-reachable with visible focus ring — PASS: served HTML shows `<a href="/work" class="...focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">`; no `tabindex="-1"` anywhere on the page; `/work` → 200.
- All four `[INPUT: …]` placeholders render verbatim, both slugs (title/problem/approach/outcome), tag-stripped + entity-decoded, substring match vs `siteContent` at runtime — PASS: 8/8 checks (4 fields × 2 slugs) FOUND via a runtime script loading `lib/content.ts`, no fabricated prose, no truncation.
- `backLabel` single-sourced: in `lib/content.ts`, read from registry (not hardcoded), mirrored in CONTENT.md with literal + Cross-check row — PASS: `content.ts:80/330` defines `CaseStudyLabels.backLabel = "Back to Work"`; `page.tsx:74` reads `caseStudy.backLabel` (not a literal — also asserted by `work-slug-page.test.mjs`'s no-hardcode check, which auto-covers new registry keys); `CONTENT.md:484-486` documents it, `CONTENT.md:990` has the Cross-check row.
- CONTENT.md "Total registry fields" line matches actual table row count — PASS: independently re-derived by my own Node script counting `## Cross-check` table data rows (excluding header/separator) → **93**, matches the stated "Total registry fields: 93" exactly.
- No raw hex or inline styles introduced in `page.tsx` — PASS: `grep -n '#[0-9A-Fa-f]\{3,8\}\|style=' page.tsx` → 0 matches.
- Static generation unchanged — PASS: build shows `● /work/[slug]` SSG listing exactly `/work/delucas` + `/work/l2detailz`; on-disk `.next/server/app/work/{delucas,l2detailz}.html` matches `siteContent.pastWork.items.map(i=>i.slug)` evaluated at runtime (`["delucas","l2detailz"]`); `prerender-manifest.json` `fallback: false`; `dynamicParams = false`, `notFound()`, `getCaseStudy`, `generateStaticParams`, `generateMetadata` all present and unmodified in behavior (read full file).
- Full regression — PASS: `test` → **77 pass / 0 fail / 0 skipped** (was 76; new pass is `CONTENT.md documents caseStudy.backLabel` picked up automatically by the existing `Object.entries(caseStudy)` loop — no test file edited). `typecheck` clean.
- Test file not edited to accommodate the change — PASS: `git diff --stat -- apps/web/__tests__/work-slug-page.test.mjs` empty; file byte-identical to commit `7bf9b68` from the prior gate.
- Median of 5 production renders of `/work/delucas` < 1s — PASS: median **0.003732s**. Raw (s): 0.011999, 0.003810, 0.003732, 0.003112, 0.002990.
- Already-adjudicated case-variant 200 residue — not re-litigated per orchestrator instruction; closed.

## Tests Added
- None this pass — reused existing `apps/web/__tests__/work-slug-page.test.mjs` (unmodified, confirmed byte-identical) plus live curl/grep/runtime-script checks against the production server for the two things that changed (h2 heading level, back link + backLabel). The existing test's registry-driven loops (`Object.entries(caseStudy)`, no-hardcode scan) auto-extended to cover `backLabel` with zero edits — by design from the prior pass.

## Not Verifiable
none — all criteria checked against served/built HTML, source, build manifest, or live prod server. Case-variant 200 remains adjudicated ground truth (not re-tested, per orchestrator instruction).

## Workarounds / Notes
- Port 3000 held by unrelated pre-existing process (left untouched, per instructions); used `next start -p 4173` directly (not the `pnpm start` script, which hardcodes `-p 3000`).
- `pkill -f "next start -p 4173"` did not match the actual `next-server` process name — had to `kill -9` the PID directly. Confirmed port free and no orphan afterward.
