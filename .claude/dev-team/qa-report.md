# QA Report
**Task:** A2 — Scaffold `templates/hosted-web/` hosted-app starter wired to `@bcns/app-core` (`@bcns/hosted-web-template`).
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Gate mode:** tests+behavioral (live smoke pass)

## VERDICT: PASS

## Criteria Checked
- Build + live 200 — `pnpm --filter @bcns/hosted-web-template build` OK; `next start` on :3100, AI off + no keys, home GET → **200** — PASS
- AI opt-in boundary — existing `ai-optin.test.mjs` proves flag OFF (with/without key) never calls the factory, and has the control case (flag ON + key → 1 call); 5/5 green — PASS
- Webhook live → suspend/provision — POST `past_due`→`suspend` (200), `active`→`provision` (200), `canceled`→`suspend` (200); routes through app-core `decideFromEvent`/`decideAccess` (unit-confirmed) — PASS
- Webhook unit → A1 logic — `webhook.test.mjs` + new QA tests assert handler decisions via `@bcns/app-core` — PASS
- No secrets — grep of committed `templates/hosted-web/` files: no real `sk_live`/`sk_test`/`pk_live`/`whsec_`/`sk-ant-` values (only placeholders + fake test keys); `.env.example` documents DATABASE_URL, Clerk, Stripe, ANTHROPIC_API_KEY — PASS
- No regressions — `Dockerfile`+`DEPLOY.md` exist; `pnpm --filter web build` OK; app-core test 10/10; template lint + typecheck clean; 4 web baseline tests (a4,b1,b3,b4) 4/4 — PASS

## Live Smoke HTTP Codes
- `GET /` (AI off, no keys) → 200
- `POST /api/stripe/webhook` past_due → 200 `{"decision":"suspend"}`
- `POST /api/stripe/webhook` active → 200 `{"decision":"provision"}`
- `POST /api/stripe/webhook` canceled → 200 `{"decision":"suspend"}`
- Server killed after run; port 3100 confirmed clear (no orphan).

## Tests Added
- `templates/hosted-web/tests/qa-hosted-web.test.mjs` — webhook active→provision & canceled→suspend through handler; env safe defaults when no keys (no throw, all undefined, AI off) + whitespace-as-unset; AI-on control case invoking injected factory once with the configured key. Wired into `test` script. Full suite 14/14 green.

## Not Verifiable
none
