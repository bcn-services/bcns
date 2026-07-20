# QA Report
**Task:** PLAN.md A4 — repo docs (CLAUDE.md, README.md) migrated to per-client-repo model
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral (docs: content-presence + stale-phrasing + build)

## VERDICT: FAIL

## Criteria Checked
- C1 per-client-repo model in CLAUDE.md — "Adding a client app later" (CLAUDE.md:64-71) says client apps are NOT in the monorepo; each gets its own repo generated from `templates/hosted-web/` consuming shared packages by version — PASS
- C2 both docs reference the ADR — CLAUDE.md:7,66 and README.md:8,141 all cite `docs/architecture/hosted-web-model.md` (file exists) — PASS
- C3 no stale monorepo-only client INSTRUCTIONS — greps for `Create apps/<client`, `reserved for future client/app`, client-placement `auto-picked up`: 0 matches; surviving `auto-picked up by workspace glob` (CLAUDE.md:31) is generic monorepo-tooling, not client placement — PASS
- C4 accurate `@bcns/app-core` description — FAIL (see below)
- C5 `corepack pnpm --filter web build` — EXIT=0, all 11 routes prerendered static — PASS

## Failures
- CLAUDE.md:12 and README.md:23 both describe `@bcns/app-core` as **"auth, DB, AI, billing"**. A1 actually built it as pricing/billing math, subscription access decisions (provision/suspend), and a BYOK Anthropic client — confirmed by `packages/app-core/src/index.ts` header + the only 4 source files (pricing.ts, subscription.ts, anthropic.ts, index.ts). It provides **no auth and no DB**. — Root Cause: docs claim capabilities (auth, DB) the package does not provide — the exact mis-description flagged as fail-if-wrong; misleads future agents that consume this doc. — Classification: **bug** (wrong capability list in 2 lines; fix = describe app-core as pricing/billing + subscription-state provision/suspend + BYOK Anthropic client, drop auth/DB).

## Tests Added
- none — docs item verified by scripted greps (stale phrasing), content reads (ADR refs, section body), source-vs-doc accuracy check against `packages/app-core/src/index.ts`, and the web build. No committed check script.

## Not Verifiable
- none — all 5 criteria covered.
