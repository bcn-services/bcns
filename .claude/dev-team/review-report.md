# Review Report
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Files Reviewed:** 9 (5 src + package.json/tsconfig/eslint + 4 test files; item A1, commits 3be5edc + b951975)
**Standards Applied:** efficiency, scalability, reliability, security

## Summary
The implementation is fundamentally sound: money is integer cents end-to-end with no float leak, the SDK is pinned at 0.39.0, DEFAULT_MODEL is exactly `claude-haiku-4-5`, the BYOK factory never reads `process.env` and never logs/leaks the key (only the trimmed key is forwarded to the injected ctor), and the DI seam makes a real SDK call impossible in tests. All 44 tests pass; lint/typecheck/web-build are green. Two real robustness gaps remain for shared money-critical code: `PRICING` is only *compile-time* readonly, so a consumer can mutate the nested tier objects at runtime and poison the shared module; and `formatUsd` silently rounds non-round cents, which is safe for today's whole-dollar prices but a latent surprise once billing renders overage/proration totals.

## Findings

### Important
- Important — packages/app-core/src/pricing.ts:23-26 — Safety & Security / Safe Defaults — `PRICING` is typed `Readonly<Record<Tier, TierPricing>>` but the nested `TierPricing` objects are neither `Readonly` nor frozen and `TierPricing` fields are mutable `number`; any consumer can do `PRICING.standard.monthlyCents = 1` and poison the shared single-source-of-truth at runtime (classic shared-constant mutation) — deep-freeze the map + each tier (`Object.freeze`) and make `TierPricing` fields `readonly`.

### Minor
- Minor — packages/app-core/src/pricing.ts:33-36 — Reliability / Explicit Over Implicit — `formatUsd` does `Math.round(cents/100)`, so non-round cents render misleadingly (`149_99` → `$150`, `149_49` → `$149`), silently hiding cents; safe now (all prices whole-dollar) but a lurking bug once billing formats overage/tax/proration — assert whole-dollar input, or use `Intl.NumberFormat("en-US",{style:"currency",currency:"USD"})` and show cents when present.
- Minor — packages/app-core/src/pricing.ts:33 — Reliability / Fail Fast — `formatUsd` has no `NaN`/`Infinity`/negative guard (unlike `monthlyCharge`'s seat guard): `formatUsd(NaN)` → `"$NaN"`, `formatUsd(-149_00)` → `"$-149"` — add a `Number.isFinite` guard for parity and decide negative-cents rendering explicitly.

## STANDARDS.md Updates
- **Money as integer cents**: all billing values are integer cents; rates/thresholds live once in `packages/app-core/src/pricing.ts`; functions read the exported constants (no duplicated magic numbers).
- **Shared constants must be runtime-immutable**: exported shared config/pricing objects must be deep-frozen (or `as const` with `readonly` fields), not merely `Readonly<>`-typed, since consumers compile the raw `.ts` and TS readonly is erased at runtime.
- **BYOK / no-env boundary**: external-client factories take a DI ctor seam (`deps.ClientCtor`), never read `process.env`, never log the key, and throw a typed error (`MissingApiKeyError`) on missing/empty/whitespace key.
