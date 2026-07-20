# QA Report
**Task:** W2 — Replace false ownership / "runs without us" claims with honest hosted framing in content.ts
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- 1. `Use it forever, free` gone; hero proof point says bcns hosts/runs it — Python grep count 0 in content.ts; `hero.proofPoints[1]` = "We host it and keep it running"; verbatim in built index.html — PASS
- 2. `whether we work together or not` gone — Python grep count 0 in content.ts and absent in all 5 built pages — PASS
- 3. No rendered page claims client owns code / software runs independently — old phrases absent from built HTML for /, /pricing, /about, /services, /work — PASS
- 4. Contact highlight says data is client's + exportable — `highlights[2]` "Your data is always yours... export it any time" renders on home — PASS
- 5. content.ts em-dash-free + no "SaaS" / "we help" — Python exact-string checks all clean — PASS
- 6. a4/b1/b3/b4 still PASS; lint+typecheck+build green; 4 pre-existing failures unchanged (no new) — verified — PASS

## Failures
none

## Tests Added
- `apps/web/__tests__/w2-hosted-framing.test.mjs` — 9 node:test subtests (all pass) covering criteria 1–5 at registry level (hero.proofPoints, contactSection.highlights, howItWorks.items[2]) plus absence greps against content.ts source.

## Not Verifiable
- none. Note: built HTML for all pages contains em-dashes, but they originate in `lib/site.ts` OG/Twitter metadata (pre-existing, outside W2 scope). Criterion 5 scopes em-dash-freedom to content.ts, which is clean.
