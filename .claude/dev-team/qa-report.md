# QA Report
**Task:** PLAN.md A3 — Architecture decision record for the hosted-web business & delivery model (`docs/architecture/hosted-web-model.md`)
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral (docs item = content-presence verification + build-not-broken)

## VERDICT: PASS

## Criteria Checked
- ADR file exists — `docs/architecture/hosted-web-model.md` present (6.8 KB) — PASS
- Pricing model — `$1,000`/`$3,000` setup, `$149`/`$349` monthly, `15` seats then `$20`/seat all found — PASS
- BYOK-AI documented — dedicated "bring-your-own-key" section (client key, Anthropic-billed, Haiku default, encrypted) — PASS
- Hosting stack — `Coolify` + `Hetzner` + `Cloudflare` + `Neon` + `Clerk` + `Stripe` all found — PASS
- Operating cost figure — "~$25–75/mo (~10 clients)", revisit trigger "~$150–200/mo" — PASS
- ≥2 risks/mitigations — risk/mitigation table has 4 entries (blast radius, DDoS, lock-in, secrets) — PASS
- Per-client repo decision — documented as "one repo per client business" — PASS
- Explicit Part II reversal — "reverses/supersedes the Part II 'monorepo, separate repos rejected' decision" (Status header + Repo model) — PASS
- Package/template propagation — versioned `@bcns/*` packages + `templates/hosted-web/` starter + version-bump propagation — PASS
- Valid Markdown — starts with H1, balanced code fences — PASS
- References `@bcns/app-core` and `templates/hosted-web/` — both present — PASS
- `corepack pnpm --filter web build` succeeds — exit 0, all pages compiled — PASS
- No regression — 4 baseline-passing web tests (a4, b1, b3, b4) still green — PASS

## Tests Added
- `docs/architecture/__tests__/hosted-web-model.check.mjs` — node --test content-presence checks (18 assertions: all required strings + Part II reversal + ≥2 risk rows + Markdown validity); 18/18 pass. Committed 3cac7b5.

## Not Verifiable
none
