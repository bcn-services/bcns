# Review Report
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Item:** A2 — `templates/hosted-web/` (`@bcns/hosted-web-template`), commits c348e04 + d80c791
**Files Reviewed:** 12 (lib/{env,ai,webhook}.ts, api/stripe/webhook/route.ts, Dockerfile, .env.example, .gitignore, .dockerignore, next.config.mjs, 3 test files)
**Standards Applied:** security (emphasis), reliability, efficiency

## Summary
No committed secrets and the AI opt-in is genuinely fail-closed — both well done. One security finding matters for a template clients clone: the webhook fails OPEN even when the signing secret is present, and reports `signatureVerified: true` while verifying nothing. The rest (secret hygiene, Docker, env parsing, tests) is sound.

## Findings

### Important
- Important — templates/hosted-web/app/api/stripe/webhook/route.ts:37-40,54,60 — Safety/Security (auth boundary) — route computes `verificationConfigured = Boolean(stripeWebhookSecret)` but NEVER verifies the signature, then calls `handleStripeEvent` unconditionally AND returns `signatureVerified: verificationConfigured`; with the secret set (real deploy) an unauthenticated POST still reaches the provision/suspend decision while the response falsely claims `signatureVerified:true` — reads production-ready but is an auth-bypass to toggle client access — Fix: when `stripeWebhookSecret` IS set, hard-fail (501/500 "signature verification not wired") before `handleStripeEvent`; keep the keyless dev path explicitly guarded so a configured-secret deploy never silently trusts unauthenticated input.

### Minor
- Minor — templates/hosted-web/app/api/stripe/webhook/route.ts:60 — Observability/honesty — `signatureVerified` is derived from "is a secret configured," not from any verification, so the field asserts a security property the code never performs — Fix: drop or rename to `signatureChecked:false` (folded into the Important fix); never surface a "verified" claim the handler cannot back.

## Notes (verified clean — no action)
- No real secrets anywhere under `templates/hosted-web/`: `.env.example` is placeholders only (`sk_test_your_...`, `whsec_your_...`, `sk-ant-your-api-key`); test keys are obvious fakes; no `sk_live`/`pk_live`/private keys. `.next/` build output is UNTRACKED and gitignored — not committed.
- `ANTHROPIC_API_KEY` read only via `readEnv` at call time; never hard-coded, logged, or `NEXT_PUBLIC_`-prefixed. No secret can reach the browser bundle or the Docker image.
- AI genuinely fail-closed: `maybeGetAiClient` checks `aiEnabled` FIRST, returns null before the factory is referenced; unset/garbage `AI_ENABLED` → false. Pinned by ai-optin tests (OFF+key → 0 calls; ON+no-key → 0 calls; control ON+key → 1 call) — not hollow.
- Dockerfile: multi-stage (deps/build/run), non-root `nextjs` user, runs `node server.js` (standalone prod, not dev), no `ENV`-baked secret, `.env*` excluded by `.dockerignore`. Sound.
- env.ts: no import-time reads/throws; empty/whitespace treated as unset; qa test proves getConfig() no-throw with all vars cleared.
- Webhook shape validation: `parseEvent` narrows untrusted JSON (status allowlist + type/customerId/subscriptionId typechecks) before routing; malformed body → 400, not crash/misroute. The gap is authentication, not shape validation.

## STANDARDS.md Updates
none (review-only; no code edits per task scope)
