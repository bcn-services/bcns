# QA Report
**Task:** W4 — CONTENT.md mirrors `apps/web/lib/content.ts` `siteContent` 1:1
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- 1:1 completeness (registry → CONTENT.md) — key-path diff script: dumped 74 concrete leaf paths from live `siteContent`, normalized indices to `[n]`, diffed vs 81 `**Field:**` templates in CONTENT.md — every real registry field is documented — PASS
- 1:1 completeness (CONTENT.md → registry, no orphans) — no `**Field:**` entry points to a path absent from content.ts; the 10 apparent "orphans" are all empty runtime arrays (`pastWork.items:[]`, `reviews.items:[]`) or array-of-scalar containers (`credentials`, `features`) / optional `tiers[n].id` the interfaces define but that produce no concrete leaf — correctly documented, not orphaned — PASS
- New pricing fields documented (setup/monthly/seats; $1,000/$149, $3,000/$349, 15 users/$20) — w4 test asserts each registry value string is present in CONTENT.md + pricing literal spot-checks — PASS
- Hosting/BYOK/stop-paying FAQ concepts documented — w4 test asserts the 3 new FAQ questions + concepts (hosting, Anthropic key, export) present — PASS
- `apps/web` build green — `corepack pnpm build` succeeded, all routes prerendered — PASS
- 4 gate tests (a4, b1, b3, b4) still pass; 4 pre-existing failures unchanged — full suite: 48 pass / 4 fail; failures are exactly a2-fix-verification, a2-new-sections, b2-registry-rework, content-registry (stale) — PASS

## Tests Added
- `apps/web/__tests__/w4-content-mirror.test.mjs` — 20 subtests: loads live `siteContent`, asserts setup/monthly/seats values + pricing literals + the 3 new FAQ questions/concepts are present in CONTENT.md (registry-value → doc presence). `node:test`; passes under `--experimental-strip-types --test`.

## Not Verifiable
- none. (Non-blocking note: `howItWorks.items[n].step` — a pre-existing field, not W4-introduced — is documented only in the cross-check table, not as a per-item `**Field:**` block; b4 and the cross-check both cover it, so 1:1 holds. Outside W4 scope; flagged for future tidy, not a failure.)
