VERDICT: PASS

# QA Report
**Task:** Item 1 re-verify after fix round #1 - Stripe self-serve Checkout + payment gate (caution: true)
**Branch:** feat/stripe-gate @ fe916e2 (fix b6c38f7; engineer HEAD 5e239a1 + 1 test commit)
**Date:** 2026-10-06
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Gates (floor / run, all green, exit 0)
connect 325 / 334 (333 claimed + my 1 added; wired in literal file list, count moved) - app-core 76 / 77 - platform 16 files/161 / 16 files/162 (DB tests skip, no stack) - tenant 43 / 43 - web 98 tests/87 pass / 98/87 - mcp 272 / 272. tsc clean. Done-when fixtures: webhook -> pending->active, grace month then paused, never-paid stays pending: covered (app-core, Deno edge, connect).

## Mutations (cp backup, restore, shasum -c all OK, git status clean)
- M1-M4 (sig compare, timestamp tolerance, churned reactivation, Shopify exemption): all still RED on intended tests, Node + Deno copies.
- New guards each RED when removed: checkoutTarget live-sub check (fail-closed), flag_duplicate (Deno copy sha1-identical to Node), pendingScreen Shopify marker, stripeReady needing all 4 env values.

## Review findings
- I1 (double subscription) CLOSED: added scenario test - pay, webhook lags, Pay again => waiting screen, one checkout; grace => portal; inside search lag the webhook flags the 2nd sub, never overwrites. RED without live-sub block and without flag_duplicate.
- I2 (Shopify install shown Pay) CLOSED live: no marker => Pay + "don't pay here if Shopify" line; marker => review screen, no Pay.
- Diff 98b1255..5e239a1 touches no forbidden file (shopify.app.toml, SHOPIFY_ALT_*, connectors/*, Shopify flow).

## Behavioral (next start :3121, invented env, fake listener :3123, both killed by PID, ports free)
- Webhook: 200 valid + 299s-old; 401 wrong v1, stale, future, missing header, tampered body; 405 GET; 2 forwards, signature + length intact.
- /signup?from=shopify and /login?next=/api/oauth/shopify/finish render; hidden from=shopify input present; plain /login links to /signup; 0 console errors.
- Marker bcns_shopify_install=1: path=/, httpOnly, SameSite=Lax, ~30d, secure only on https; set by real signUp (from=shopify) and signIn (next=finish) submits; never by GET (/signup, /login, /pending?from=shopify).

## Findings
- MINOR - apps/connect/app/signup/actions.ts, apps/connect/app/login/actions.ts - marker is never cleared: a plain /signup owner in a browser that did the Shopify hand-off sees no Pay for 30 days (reproduced: plain signup left marker set, /pending showed review); signIn also sets it on a failed password - clear it in signUp without from and in signOut.
- LOW - platform/test/stripe-billing.test.ts - SQL flag_duplicate/record_payment guards and grace-expiry pause verified only by the DB suite in CI (no local stack).
- INFO - search-lag double-Checkout window remains (documented); flag_duplicate + alert email is the backstop. A pending owner with an incomplete live sub waits up to ~23h. Deno billingView protected only by byte parity. checkoutTarget ignores the marker (deferred). Fixtures hand-authored.

## Tests Added
- `apps/connect/tests/stripe-billing.test.mjs` - pay-lag scenario test (commit fe916e2). No new infra.

## Not Verifiable
none (SQL guards: see LOW).
