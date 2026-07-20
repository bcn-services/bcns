# QA Report
**Task:** A1 — `@bcns/app-core`: pricing/billing math, subscription access decisions, BYOK Anthropic client factory.
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral (pure-logic pkg — no live server; gate = unit tests + import verification, SDK mocked via DI)

## VERDICT: PASS

## Criteria Checked
- monthlyCharge 15/16/40 seats, both tiers — engineer suite + QA edge tests, all pass — PASS
- setupFeeCents both tiers — engineer suite + QA (differ-per-tier) — PASS
- decideAccess all four statuses (active/past_due/canceled/trialing) — engineer + QA (trialing->provision, past_due->suspend) — PASS
- createAnthropicClient valid key via mocked DI ctor + MissingApiKeyError on missing/empty — engineer + QA (empty, whitespace, trimmed passthrough) — PASS
- Single pricing object, no duplicated magic numbers — grep of subscription/anthropic/index.ts for 149/349/1000/3000/20/15: NONE found — PASS
- formatUsd(149_00)==="$149", formatUsd(1_000_00)==="$1,000" — asserted, pass — PASS
- lint + typecheck green — `corepack pnpm --filter @bcns/app-core lint && typecheck` both clean — PASS
- importable as `@bcns/app-core` — `tsx -e "import * as c from '@bcns/app-core'"` resolves all 11 symbols — PASS
- web app still builds — `corepack pnpm --filter web build` succeeded — PASS
- web 4 passing tests (a4,b1,b3,b4) still green; 4 pre-existing failures unchanged — 48 pass / 4 fail, identical set — PASS
- SDK stays mocked (guardrail) — all client tests use injected FakeCtor; no network — PASS

## Failures
none

## Tests Added
- `packages/app-core/tests/qa-app-core.test.mjs` — 20 edge-case tests: exact overage math + breakdown fields, seat boundaries (14/15/0), invalid seat inputs (negative/non-integer/NaN rejected), decideAccess mapping, MissingApiKeyError on empty/whitespace, trimmed-key passthrough to injected ctor, model default/override. Wired into package.json `test` chain.

## Spec Discrepancy (non-blocking — noted, not a code bug)
- Task text states 16-seat-standard total = 151_00 and 40-seat-advanced = 399_00. These are arithmetically inconsistent with the authoritative rates (base 149_00/349_00 + PER_SEAT_CENTS=20_00, i.e. $20/seat — confirmed by criterion-2's own magic-number list). Correct math: 149_00 + 1*20_00 = 169_00; 349_00 + 25*20_00 = 849_00. The 151_00/399_00 figures only hold at $2/seat. Engineer's code is correct; the task's example totals are typos. QA tests assert the correct totals (169_00 / 849_00) and document this inline.

## Not Verifiable
none — pure-logic package, no routes/DB/serialization, so no live-server smoke pass applies; import verification + DI-mocked client tests cover the boundary.
