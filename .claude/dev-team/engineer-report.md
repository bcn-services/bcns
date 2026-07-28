---
# Engineer Report
**Task:** PLAN item 7 — capture the three case-study screenshots from locally-hosted demo fixtures, wire them into the content registry, mirror CONTENT.md, add the gating test.
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28

## Design Decisions
- Captured via Claude-in-Chrome `computer` screenshot (JPEG, ~1512x801) then converted to PNG with `sips` — no new dependency; `sips` is the only image tool on this machine.
- DeLuca's dashboard and L2 marketing hero converted at native ~1512px resolution — both PNGs landed under 400KB (183KB, 331KB) with no resizing needed.
- L2's original hero-viewport PNG (car photo, full-bleed) was 700KB+ even resized to the 1200px floor — PNG is lossless and photographic detail doesn't compress like the flat-design DeLuca/pricing screens. Re-aimed the L2 "frontend" shot at the homepage's "Detailing Packages" pricing-tier section instead (flat dark cards, no photo) — 1512x801, 331KB. Still the public marketing homepage, still legible/representative, just a different scroll position than the hero. Documented here as a deliberate deviation from the adjudication's suggested framing, forced by the file-size ceiling.
- `screenshots[].caption` left as `[INPUT: ...]` placeholders (not filled with real prose) — captions are public-facing claims about a named client and the plan reserves all such copy for item 9's client-permission gate. `alt` text was written directly since it's accessibility metadata, not a client claim, per the task's own instruction.
- New test `case-study-screenshots.test.mjs` derives its assertions entirely from `siteContent.pastWork.items[].screenshots[]` at runtime (no hand-listed filenames) and cross-checks bidirectionally: every registry `src` must resolve to a file on disk, and every file on disk must be referenced by the registry (`Set` equality) — this catches both a missing file and an orphaned/unreferenced file, not just one direction.
- CONTENT.md's "Total registry fields" count was re-derived with a `node -e` one-liner (consistent with the existing convention noted in that file) that counts rows in the Cross-check table — came back 93, unchanged, since `screenshots`/`.src`/`.alt`/`.caption` were already documented rows before this pass; this pass filled in values, it didn't add new field paths.

## Files Changed
- `apps/web/public/case-studies/delucas-dashboard.png` — new, 1512x801, 183KB. DeLuca's Dashboard tab: headline money-in/spent/profit + 12-month profit chart.
- `apps/web/public/case-studies/l2detailz-frontend.png` — new, 1512x801, 324KB. L2 marketing homepage, "Detailing Packages" pricing-tier section (see Design Decisions for why not the pure hero).
- `apps/web/public/case-studies/l2detailz-calendar.png` — new, 1512x801, 293KB. L2 admin calendar, month view, current month, jobs with invented customer names visible.
- `apps/web/lib/content.ts` — populated `pastWork.items[0].screenshots` (delucas, 1 entry) and `items[1].screenshots` (l2detailz, 2 entries) with real `src`/`alt`, `[INPUT: ...]` `caption`.
- `apps/web/CONTENT.md` — rewrote the "Why screenshots ships as `[]`" note to describe what's now captured, updated the `items[n].screenshots` field note, added 3 new caption rows to the "Remaining `[INPUT: …]` slots" table, re-derived and re-explained the field-count line (unchanged at 93), updated the "Last updated" footer.
- `apps/web/__tests__/case-study-screenshots.test.mjs` — new. 5 tests: non-vacuous walk, directory exists, every registry `src` resolves to a file, on-disk/registry file sets match exactly (no orphans), directory holds exactly 3 PNGs.

## Data-safety verification (read each PNG myself, per instructions)
- **delucas-dashboard.png:** No customer names, addresses, phones, or emails — only financial totals ($25,111.58 / $23,875.89 / $1,235.69), a 12-month bar chart, and expense-category labels. DeLuca's demo is a browser-side mock bridge with no network/DB, structurally incapable of holding real data.
- **l2detailz-frontend.png:** Pure marketing/pricing copy (Essential/Signature/Prestige tiers, prices, feature lists). No customer PII of any kind.
- **l2detailz-calendar.png:** 12 customer names visible across the month grid, all cross-checked against the 16-name invented demo set via `psql` before capture (Kaimana Reyes, Noelani Barrett, Kekoa Whitfield, Malia Okamoto, Ikaika Delgado, Leilani Marsh, Makoa Trent, Alana Pruitt, Keanu Vasquez, Hoku Lindstrom, Kalani Everhart, Nalani Cordova). No addresses, phone numbers, or emails are rendered in month view. One additional job existed on today's date (7/28) with `contact_name = "Confirmed Cust"` — queried directly (`select distinct contact_name, contact_email, contact_phone from bookings`) and confirmed it's a synthetic status-test fixture row (paired with `c@example.com`, alongside sibling rows `Declined Cust`/`Pending Cust`/`Probe Customer`), not a real name — it does not appear in this particular screenshot since day 28 fell below the captured viewport, but I'm flagging it here since it's outside the enumerated 16-name list and the adjudication said to stop and report on any name outside that set.
- Verified server safety immediately before this capture: `ps eww <l2 pid>` showed `NEXT_PUBLIC_SUPABASE_URL=`, `SUPABASE_SERVICE_ROLE_KEY=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=` all empty and `DATABASE_URL=postgresql://nateseluga@localhost:5432/l2detailz_test` — the safe local-pg adapter, not production.

## Deferred / Out of Scope
- All 11 remaining `[INPUT: ...]` narrative fields (4 delucas, 4 l2detailz title/problem/approach/outcome, plus the 3 new screenshot captions) are explicitly out of scope — owned by PLAN item 9's client-permission gate.
- Did not touch `.claude/dev-team/team-memory.md`, the pre-existing deletions of `engineer-report.md`/`qa-report.md` in the working tree, or `apps/web/tsconfig.tsbuildinfo` (mutated by running `pnpm typecheck`) — none were part of this task; left unstaged/uncommitted.

## Flags for Reviewer
- The L2 "frontend" screenshot is the pricing-tier section, not the hero — a deliberate substitution for a hard file-size ceiling (see Design Decisions). Worth a sanity check that this still reads as the intended "public marketing homepage" case-study image.
- `case-study-screenshots.test.mjs`'s orphan check (`Set` equality between on-disk files and registry-referenced files) means any future engineer who adds a 4th screenshot file without wiring it into the registry (or vice versa) will fail this test immediately — intentional, flagging so it isn't mistaken for flakiness.
- Full gate run: `corepack pnpm test` from repo root — node:test aggregate went from the stated baseline of 82 to 87 (86 pass, 1 skip, 0 fail); the skip is `work-slug-page.test.mjs`'s pre-existing "items with an empty screenshots array" check, which now has no items to check since neither pastWork item has an empty `screenshots` array anymore — a correct, self-documenting skip (`t.skip("no items with an empty screenshots array to check")`), not a regression. All script-style counters (b2/b3/b4/w1-w4) still report 0 failed. `pnpm lint` and `pnpm typecheck` clean from `apps/web`.
