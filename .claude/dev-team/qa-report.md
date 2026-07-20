# QA Report
**Task:** W3 — "how hosting works" explanation (monthly-fee coverage, BYO-Anthropic-key, stop-paying) via faq.items[4..6]
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- C1 monthly-fee coverage (hosting, backups, bug fixes) — registry item found + built `.next/server/app/pricing.html` contains "hosting"/"backup"/"bug fix" (also "security patch") via Python exact-string — PASS
- C2 BYO-Anthropic-key + AI optional — faq item asserts "anthropic key" + optional/omittable + "bills you directly"; confirmed in rendered HTML — PASS
- C3 stop-paying → hosting stops AND data exported/handed over — faq item asserts hosting stops/"goes offline" + "export"/"hand it over"; confirmed in rendered HTML — PASS
- C4 new copy em-dash-free + buzzword-free — 3 new faq items em-dash/SaaS/"we help" free; `git diff` on content.ts adds 0 em-dashes — PASS
- C5 gating tests + green build — a4/b1/b3/b4 PASS; lint + typecheck + build all green; 4 pre-existing failures (a2-fix-verification, a2-new-sections, b2-registry-rework, content-registry) unchanged, no new failures — PASS

## Note on the one HTML em-dash (not a defect)
Python flagged 12 em-dashes in `pricing.html`, all pre-existing site-metadata tagline ("bcns — Custom software... — built to fit...") in `<head>` og/twitter/description tags + the RSC flight-data echo. `git diff worktree-model-migration -- content.ts` shows 0 em-dashes added by W3; all three new FAQ render segments are em-dash-free. C4 scopes to new copy, which is clean.

## Failures
none

## Tests Added
- `apps/web/__tests__/w3-hosting-explanation.test.mjs` — 7 tests: registry-level assertions for the 3 new faq.items (C1–C3), behavioral presence check against built `pricing.html` (C1), em-dash/buzzword scan on new copy (C4), append-not-renumber guard (items[0] unchanged, len>=7). All 7 PASS.

## Not Verifiable
none
