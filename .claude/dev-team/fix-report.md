# Fix Report
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Findings addressed:** 2 of 2 actionable Minor review findings (W1 pricing)

## Changes Made
- apps/web/components/pricing.tsx:27 — replaced magic `index === 2` with `isConsulting = !setup` so the render branches on data shape (build tiers have setup/monthly/seats; consulting has price), preventing blank `<p>` on reorder — review Minor.
- apps/web/__tests__/w1-pricing.test.mjs:62-90 — added "criterion 1b" asserting pricing.tsx renders `{setup}/{monthly}/{seats}` (+consulting `{price}`) and, when a build exists, the six money strings in built `pricing.html`; gates component drift the registry-only tests missed — review Minor.

## Verification
- corepack pnpm lint + typecheck + build all green; `/pricing` prerendered static.
- Suite: 4 gate tests (a4,b1,b3,b4) green; w1-pricing 8/8 (was 7, +1 new); exactly the 4 pre-existing stale files still fail (a2-fix, a2-new, b2, content-registry) — no new failures.
- Python check on built HTML: all six strings ($1,000/$149/$3,000/$349/$20/15) FOUND.

## Disputed
none.

## Deferred
- content.ts:317,332 duplicate `price` on build tiers — reviewer marked acceptable (kept for type/b3 stability); left unchanged per instructions.

---
# Fix Report — W2 hosted framing
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Findings addressed:** 2 of 2 (1 review Important + 1 review Minor)

## Changes Made
- apps/web/lib/content.ts:278 — reworded contact copy from present-tense self-serve "you can export it any time" to service/intent "we'll export it and hand it over whenever you ask" (no unbuilt-feature guarantee; still satisfies W2 #4 data-ownership+export) — review Important.
- apps/web/lib/content.ts:353 — renamed "Plain-English handoff notes" to "Plain-English project notes" to avoid drift from site-wide hosting reframe — review Minor.

## Verification
- corepack pnpm lint + typecheck + build all green.
- Suite: a4/b1/b3/b4 + all w1 + all w2 pass; exactly the 4 pre-existing files fail (a2-fix, a2-new, b2, content-registry) — no new failures.
- Python: content.ts has 0 em-dashes; "Use it forever, free" and "whether we work together or not" absent. W2 test #4 unchanged — reworded copy retains "your data" + "export" tokens the `/export/` assertion matches.

## Disputed
none.

## Deferred
none.
