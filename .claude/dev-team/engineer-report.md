# Engineer Report
**Task:** W1 — Reshape pricing registry + page to setup + recurring monthly + seats
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Extended `PricingTier` with three OPTIONAL free-string fields — `setup?`, `monthly?`, `seats?` — and KEPT the required `price` field. Rationale: pricing.tsx and b3-copy-wiring both read the tier shape; keeping `price` required avoids type/test churn and lets the consulting card ($800/day) keep rendering `price` unchanged.
- Build tiers (index 0,1) render `setup` + `monthly` + `seats`; consulting tier (index 2 / `isConsulting`) still renders `price`. pricing.tsx branches on `isConsulting` so the AI day-rate card stays visually distinct and untouched.
- Build tiers still carry a `price` value (`"$1,000 setup"` / `"$3,000 setup"`) so the field is never empty/stale even though the page no longer displays it for builds.
- Prices are exact free strings (`$149/mo`, `$3,000 one-time setup`, `Includes up to 15 users, then $20/user per month.`) so exact copy renders verbatim. No dashes used anywhere in new copy (avoids the en-dash-in-range ambiguity entirely).

## Files Changed
- `apps/web/lib/content.ts` — added `setup/monthly/seats` to `PricingTier`; rewrote Standard ($1,000/$149) + Advanced ($3,000/$349) tiers with the 15-users/$20-overage line; rewrote FAQ items[0] cost answer and pageMeta.pricing description to setup+monthly+seats; removed all old $2,000/$5,000/$15,000 range strings (4 sites).
- `apps/web/components/pricing.tsx` — destructured new fields; build cards now render setup + monthly + seats stacked; consulting card unchanged.

## Deferred / Out of Scope
- `apps/web/CONTENT.md` mirror not updated (new `setup/monthly/seats` field docs) — that is W4's 1:1 mirror job; b4-content-md gate still passes (substring match, no new field asserted).
- 4 pre-existing FAILING tests (a2×2, b2, content-registry) left as-is per baseline; not made worse.

## Flags for Reviewer
- No hot paths / queries / external calls — pure static content + one component render branch.
- Verify checks: em-dashes=0, en-dashes=0, old ranges=0; all of `$1,000 $149 $3,000 $349 $20 15` render on built pricing.html. Tests: 4 pass (a4,b1,b3,b4) unchanged.
