# Engineer Report
**Task:** W4 — Mirror all W1–W3 copy changes from `content.ts` into `apps/web/CONTENT.md` 1:1
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Light-track docs mirror; no architecture/API/data-model work. Diffed CONTENT.md field-by-field against the CURRENT `content.ts` (read the source, not just the summary).
- Documented the new optional `PricingTier` fields (`setup`/`monthly`/`seats`) as per-tier `#### … _(optional)_` blocks under tiers[0] and tiers[1]; noted tiers[2] (AI consulting, day-rate) omits them — matching the registry where only build tiers carry them.
- Refreshed stale hardcoded `Currently` price values (tiers[0] $2,000–$5,000 → $1,000 setup; tiers[1] $5,000–$15,000 → $3,000 setup). Free-string fields never verbatim-mirrored in CONTENT.md (hero proofPoints, contact highlights) describe purpose only, so W1/W2 hosted-framing edits to those needed no value change.
- FAQ is open-ended (`items[n]`), so the three new W3 entries add array entries, not new field paths. Added a "Seeded questions" list (indices 0–6) capturing all seven Q&As incl. monthly-fee coverage, BYO-Anthropic-key, and stop-paying/data-export; bumped intro "5 pre-seeded" → "7".
- Cross-check: added 3 rows (`tiers[0..1].setup/monthly/seats`); bumped stated total 77 → 80. FAQ items stay under the generic `items[n]` rows — documented that explicitly.

## Files Changed
- `apps/web/CONTENT.md` — added setup/monthly/seats tier docs; refreshed stale tier prices; added seeded-FAQ list (7 entries) + intro count; +3 cross-check rows and 77→80 total; updated footer date/summary.

## Deferred / Out of Scope
- Docs-only item: did not touch `content.ts` or components. Did not re-derive the legacy "77" (the table has 79 rows; some collapse concepts) — applied the accurate +3 delta relative to their baseline.
- Pre-existing em-dashes in CONTENT.md prose/headers left as-is (no-em-dash voice rule targets live site copy, not this docs file); new FAQ list uses the file's existing em-dash separator convention.

## Orphan Fields Found + Resolved
- Orphans (registry field with no CONTENT.md entry): `setup`, `monthly`, `seats` on tiers[0]/[1] — resolved by adding field docs + cross-check rows. No reverse orphans (no CONTENT.md field absent from registry). Python spot-check confirms all new names/values present and stale values ($2,000–$5,000, $5,000–$15,000, Build & handoff, Yours to use, Use it forever, free) absent.

## Verification
- `corepack pnpm build` green; `corepack pnpm lint` clean.
- Tests: 28 pass / 4 fail. Gate tests a4, b1, b3, **b4 (mirror gate)** PASS; the 4 pre-existing stale failures (a2-fix-verification, a2-new-sections, b2-registry-rework, content-registry) unchanged.

## Flags for Reviewer
- b4 uses substring matching, so it does NOT enforce presence of `setup`/`monthly`/`seats` — the 1:1 guarantee here is documentation-level, verified by the spot-check script, not an automated gate.
