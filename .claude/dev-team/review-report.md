# Review Report
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Files Reviewed:** 3 (content.ts, pricing.tsx, w1-pricing.test.mjs)
**Standards Applied:** efficiency, reliability, correctness-of-intent, voice/guardrails, consistency

## No Critical or Important findings

Money-strings are correct and consistent across all four sites — pricing tiers
(content.ts:317-335), FAQ answer (367), and pageMeta.pricing description (465):
$1,000/$149, $3,000/$349, 15 users then $20/user, consulting $800/day. No old
$2,000/$5,000/$15,000 ranges remain. Voice clean: em-dash=0, en-dash=0, no
SaaS/"we help"/buzzwords. 7/7 W1 tests pass; 4 gate tests (a4,b1,b3,b4) stay green.

## Findings

### Minor
- Minor — pricing.tsx:27 — render branch keys on magic `index === 2` not field presence; a reordered/added non-consulting tier lacking `setup/monthly/seats` would silently render three blank `<p>` (undefined→nothing) — branch on `isConsulting = !!tier.price && !tier.setup` or a `tier.isConsulting` flag so render follows data shape, not array position.
- Minor — w1-pricing.test.mjs:8-73 — tests assert the registry (single source of truth) but never assert pricing.tsx renders setup/monthly/seats; a regression deleting those `<p>` in the component keeps all 7 green (QA's built-HTML check caught it but isn't committed) — add one render/snapshot or built-HTML assertion so component drift is gated, not just registry drift.
- Minor — content.ts:317,332 — build tiers keep a now-unused `price` ("$1,000 setup") that the page never renders for builds (only setup/monthly/seats shown); harmless but a stale second source of the setup figure that can drift from `setup` — acceptable per engineer's rationale (keeps `price` required for b3/type stability); note only, no fix needed unless W4 consolidates.

## CONTENT.md drift (noted, not fixed)
CONTENT.md mirror of new `setup/monthly/seats` field docs is deferred to W4 per
plan; b4-content-md gate still passes (substring match, no new field asserted).

## STANDARDS.md Updates
none — no project-specific efficiency/reliability pattern beyond existing conventions.
