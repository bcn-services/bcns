# Engineer Report
**Task:** PLAN.md W2 — Replace false ownership / "runs without us" claims with honest hosted framing in content.ts
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Copy-only change in `apps/web/lib/content.ts` (the single source of truth); components read by index, so no component edits needed.
- No b3 assertion edits required: b3 locks hero.headline, nav titles, tier names, faq q1, and holding title only — none of the strings I changed. Verified all 5 stay intact via Python.
- Retitled contact highlight `Yours to use` -> `Your data`; the honest managed-service framing is about data ownership + export, not the software running independently. Kept highlights a 3-item tuple (icons MessageSquare/Clock/Mail unchanged).
- Reframed process step `Build & handoff` -> `Build & launch` (build -> launch -> we host/run/maintain), removing the one-time-handoff implication.
- Left `Plain-English handoff notes` (AI consulting tier): consulting genuinely hands off notes, not running software, so it is truthful.
- Left `Brandon owns scoping` (owns a responsibility, not the code) — not an ownership claim about the software.

## Files Changed
- `apps/web/lib/content.ts` — hero.proofPoints[1] -> "We host it and keep it running"; contactSection.highlights[2] retitled "Your data" with hosted + exportable-data description; howItWorks.items[2] -> "Build & launch" hosted framing; founder bio "after handoff" -> "after launch".

## Deferred / Out of Scope
- CONTENT.md 1:1 mirror not re-synced (that is the W4 item's job); b4 still passes (substring-based).
- Stale pre-existing failures (a2-fix-verification, a2-new-sections, b2-registry-rework, content-registry) left untouched — outside this item's scope.
- Readability check not run: `textstat` not installed in env; new sentences are short/plain, well within third-to-eighth-grade level.

## Flags for Reviewer
- Verify no other page copy implies client-run/one-time-delivery software; grep of "own/forever/yours/handoff" left only truthful uses.

## Verification
- Python string gate: all W2 criteria pass; no em-dash, no SaaS, no "we help"; b3-locked strings intact.
- `apps/web`: lint, typecheck, build all green.
- Tests: a4/b1/b3/b4 PASS (unchanged); 4 pre-existing stale failures unchanged. No new regressions.
