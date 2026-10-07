VERDICT: PASS

## VERDICT: PASS
**Branch:** feat/stripe-gate @ 9c31013 (no test additions needed, nothing committed; .claude/dev-team is gitignored)
**Gate mode:** tests+behavioral | **Date:** 2026-10-06

## Gate counts (re-run by QA; floors in parens)
- connect 325 pass/0 fail/0 skip (314); app-core exit 0, 76 tests (61); platform 16 files/161 (15/146; DB files skipped locally, no stack); tenant 43 (42); web 98: 87 pass/11 skip/0 fail (same); mcp tsc clean + 272.
- Wiring probes (appended throwing test, count + fail moved, restored from cp, shasum equal): app-core stripe.test.mjs -> "# fail 1" exit nonzero; connect stripe-billing -> 326 tests/1 fail; platform edge-stripe-webhook -> 162 tests/1 fail. All three new files run.

## Mutations (each restored, shasum/cmp identical, git status clean)
- M1 signature compare: app-core RED "stripe verifier: signature compare rejects a wrong secret..." (+ "plugs into processWebhook"); Deno RED "signature compare rejects a wrong secret, a tampered body and a wrong digest".
- M2 timestamp tolerance: app-core RED "rejects a validly signed timestamp outside the tolerance..."; Deno RED same-named test.
- M3 churned reactivation (guard line deleted): app-core RED "decideBilling: a churned client is never reactivated"; Deno copy RED 2 tests (parity + churned).
- M4 Shopify exemption: decideBilling guard removed -> app-core RED "a Shopify-billed tenant is never activated or put in grace"; billingView exemption removed -> RED "billingView: who sees Pay"; Deno copy RED parity test + "a Shopify-billed tenant is never activated" (and billingView variant, 1 red).
- Drift (item 3): platform/test/edge-stripe-webhook.test.ts "_shared/app-core/subscription.ts is byte-identical to packages/app-core/src/subscription.ts" already exists, wired, goes RED on any edit to the copy. Nothing added.

## Behavioral (hub next start :3121, fake env, listener :3123, no .env read)
- Signed fixture: 200, forwarded once, byte-exact (hex equal to fixture file) with Stripe-Signature header intact; 299s-old signature also 200.
- Wrong v1: 401, stale (-1h) 401, future (+1h) 401, missing header 401: none forwarded (listener log had exactly 2 entries, both the valid ones).
- GET /api/webhooks/stripe 405 (no /login redirect); GET /pending 307 -> /login; POST /pending 303 -> /login; /api/stripe/webhook 307 -> /login (confirms why route is /api/webhooks/stripe). Checkout/portal are server actions on /pending, gated by middleware plus signedIn() in actions.ts.
- Teardown: both servers killed by PID, lsof shows 3121/3123 free; worktree clean.

## done-when coverage
- pending->active on paid checkout: app-core "decideBilling: a payment activates pending..." + edge "checkout.session.completed on a pending client activates it" + DB test.
- paid-before + lapse -> grace +30d, access kept: "a lapse after paying starts 30 days of grace once" (GRACE_SECONDS=30d, active stays active) + edge test.
- grace expiry -> paused: ONLY platform/test/stripe-billing.test.ts via data.pause_lapsed_clients() (needs local stack; skipped here, runs in platform-ci via supabase start). No pure predicate.
- never-paid stays pending/untouched; churned never reactivated; Shopify exempt (never Pay, activate, grace); stale event; pay again resumes: all in app-core + Deno handler tests.
- Event-id dedupe: edge "a replay is 200" (RPC mocked) + DB test only.
- Pending owner server-side (billing_self from auth.uid(), no client id param); checkout mode=subscription, price=STRIPE_PRICE_ID, client_reference_id from billing row: tested in connect "checkoutTarget".
- Legal copy: content.ts + CONTENT.md describe live Checkout/grace/Shopify; a4-legal-pages green; no stale "until Checkout is live" text anywhere; no MCP/OAuth jargon in new hub copy. No forbidden file (Shopify toml, connectors/*) in diff.

## Findings
- LOW — platform/test/stripe-billing.test.ts — grace-expiry pause, event-id dedupe and the SQL guards (churned/Shopify, advisory lock) are verified only by the DB suite, which could not run locally (no stack, per guardrail); SQL-side mutations not run. Rely on platform-ci being green before merge; consider a pure expiry predicate if a local check is wanted.
- LOW — .github/workflows/platform-ci.yml:58 — turbo job excludes apps/web, so a4-legal-pages (the legal-copy test) does not run in CI; QA ran it locally, green (pre-existing).
- INFO — fixtures hand-authored, not live captures (engineer flag); verifier/handler tests cannot catch a basil-shape drift in a live event.
- No Critical/Important.
