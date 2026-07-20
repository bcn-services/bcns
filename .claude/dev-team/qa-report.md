# QA Report
**Task:** W1 — Reshape pricing to setup + recurring monthly + seats (registry + page + FAQ)
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral

## VERDICT: PASS

**Branch:** dev-team/model-migration-run

## Criteria Checked
- C1 three cards, each build card shows setup + monthly + 15-seats/$20-overage — w1-pricing C1 (registry) + Python check on built `.next/server/app/pricing.html` (both build cards render `$X one-time setup`, `$X/mo`, `Includes up to 15 users, then $20/user per month.`) — PASS
- C2 exact strings `$1,000 $149 $3,000 $349 $20 15` on rendered `/pricing` — Python exact-string check on built HTML (all six FOUND, entities unescaped) + w1-pricing C2 — PASS
- C3 no old range strings (`$2,000`/`$5,000`/`$15,000` or "to" variants) anywhere in content.ts — Python scan (all 0) + w1-pricing C3 regex — PASS
- C4 FAQ "How much will my project cost?" describes setup+monthly+per-seat, no $2,000/$5,000/$15,000 — w1-pricing C4 (answer matches setup/month/15 users/$20/user, old figures absent) — PASS
- C5 content.ts no em-dashes, no SaaS / "we help" / buzzwords — Python (em-dash=0, en-dash=0, banned=0) + w1-pricing C5 — PASS
- C6 4 passing tests still green; lint+typecheck+build green; 4 pre-existing fails not worsened — a4/b1/b3/b4 all PASS; build EXIT=0 (`/pricing` prerendered static); full suite 11 pass / 4 fail = exactly a2-fix, a2-new, b2, content-registry — PASS

## Tests Added
- `apps/web/__tests__/w1-pricing.test.mjs` — 7 subtests covering C1–C5 at registry level (`siteContent.pricing`, `faq.items[0]`, `content.ts` source scan) plus exact-string presence; all pass under `node --experimental-strip-types --test`.

## Not Verifiable
none — all six criteria covered by tests plus an un-mocked behavioral check against the built HTML.
