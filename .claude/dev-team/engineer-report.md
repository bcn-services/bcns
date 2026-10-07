# Engineer Report
**Task:** Item 1 — Stripe self-serve Checkout + payment gate, attempt #2: apply review findings (2 Important, 2 Minor)
**Branch:** feat/stripe-gate (findings commit b6c38f7, on 98b1255)
**Date:** 2026-10-06

## Design Decisions
- Attempt-1 design stands (pure app-core decisions + byte-identical Edge copy, two verifiers, hub verify-then-forward, every guard repeated in the SQL RPC, grace expiry in the worker tick).
- No second subscription, hub side: `checkoutTarget` asks Stripe for a live subscription before any Checkout, by stored customer (`GET /v1/subscriptions?customer=&status=all`) else by `metadata["client_id"]` search; live = active/trialing/past_due/unpaid/incomplete.
- Live found: pending owner → `/pending?paid=1&waiting=1` (the existing "Stripe is still confirming" copy; `?paid=1` alone says "ready to open", which is false while the webhook lags); grace/paused owner → billing portal (stored customer, else the live sub's customer).
- Fail closed: Stripe error, timeout, malformed body, or `has_more: true` with no live sub on the page → `/pending?error=billing`, no session; a non-UUID client id never reaches the search query.
- Search is eventually consistent (~1 min, longer in a Stripe outage): documented in `liveSubscription`'s comment; flag_duplicate is the backstop for that window. PR risk line needed.
- Grace card: one "Update payment" button; the server opens the portal while a live sub exists and only starts a new subscription when none is left (replaces Pay beside Update card).
- No second subscription, webhook side: first one applied wins. Active, no grace, stored sub ≠ paid signal's sub → new action `flag_duplicate`: client row unchanged, one `data.notifications` row (`kind stripe_second_subscription`, dedupe per client+extra sub, payload kept/other/event id) → existing worker alert email. In grace or paused the stored sub lapsed, so record_payment/resume replace it.
- SQL agrees with TS: `record_payment` WHERE now refuses overwriting a stored live sub (conflict), `flag_duplicate` WHERE requires exactly the TS condition, so no permanent-conflict retry loop.
- Shopify App Store hand-off: hub-wide httpOnly cookie `bcns_shopify_install` (path `/`, 30 days), set by `signIn` when `next` is the finish path and by `signUp` when the form carries `from=shopify` (login's Create account link adds `?from=shopify` during the hand-off). A UI hint only: forging it hides your own Pay.
- `pendingScreen(billing, canPay, fromShopifyInstall)` (pure, lib/stripe-billing.ts) decides pay/paused/review; the marker always means no Pay (new → review copy, paused → "email us"). Pay screen gains: "Adding bcns Connect from the Shopify App Store? Shopify bills you for it, so don't pay here."
- `stripeReady` requires secret key, price, webhook secret and webhook function URL.
- No `config.toml` `[functions.stripe-webhook]` entry: no function there uses that pattern; DEPLOY.md carries `--no-verify-jwt` instead.

## Files Changed
- `apps/connect/lib/stripe-billing.ts` — stripeReady 4 keys; SHOPIFY_INSTALL_COOKIE/SHOPIFY_FROM/shopifyInstallCookie; pendingScreen; liveSubscription lookup; checkoutTarget gate; openPortal shared with portalTarget.
- `apps/connect/app/pending/page.tsx` — reads the marker via pendingScreen; grace card single Update payment; Shopify line on the Pay screen.
- `apps/connect/app/login/page.tsx` — Create account link carries `?from=shopify` during the install hand-off.
- `apps/connect/app/login/actions.ts` — signIn sets the marker cookie when next is the finish path.
- `apps/connect/app/signup/page.tsx` — hidden `from=shopify` input when arrived with it.
- `apps/connect/app/signup/actions.ts` — signUp sets the marker cookie for `from=shopify`.
- `apps/connect/DEPLOY.md` — stripe-webhook deploy with `--no-verify-jwt` and `supabase secrets set STRIPE_WEBHOOK_SECRET=<signing secret>` (name only).
- `apps/connect/tests/stripe-billing.test.mjs` — checkout tests route Stripe by path (lookup then session); +6 tests (stripeReady, pending live → confirming, each live status, grace/paused → portal, fail closed, pendingScreen).
- `apps/connect/tests/signup.test.mjs` — login link assertion per case; +2 tests (marker set by signUp/signIn with cookie attrs; /pending render with and without the marker).
- `packages/app-core/src/subscription.ts` + `platform/supabase/functions/_shared/app-core/subscription.ts` — `flag_duplicate` decision; byte-identical (shasum df53adb7…).
- `packages/app-core/tests/stripe.test.mjs` — +1 test, flag_duplicate vs record_payment/resume cases.
- `packages/app-core/tests/fixtures/stripe/subscriptions.{list,search}.json` + README — Stripe list/search response shapes, fake ids.
- `platform/supabase/functions/stripe-webhook/handler.ts` — ApplyInput action type gains flag_duplicate.
- `platform/supabase/migrations/20261007000100_stripe_billing.sql` — flag_duplicate in check/validation/SET/WHERE, record_payment overwrite guard, alert insert (file not yet in prod).
- `platform/test/edge-stripe-webhook.test.ts` — +1 test (invoice.paid fixture → flag_duplicate / record_payment).
- `platform/test/stripe-billing.test.ts` — +1 DB test (overwrite refused, alert once, grace replaces); skips locally, CI runs it.

## Deferred / Out of Scope
- checkoutTarget itself does not read the Shopify marker (the page hides Pay; a direct action POST only bills the poster). Add if the marker becomes authoritative.
- Marker is per browser: a confirm email opened in another browser loses it; the Pay-screen line covers that case.
- Stripe dashboard "after all retries fail" → cancel or mark unpaid (not leave past_due), and the billing portal allowing payment-method updates for unpaid subs: Nate-only PR steps, no code.
- A Stripe payer who later installs the Shopify app is still billed by both (attempt-1 exemption needs paid_at null); unchanged here.

## Flags for Reviewer
- Extra Stripe GET on every Pay click (≤100 subs per page, 10 s timeout); `has_more: true` fails closed rather than paging.
- flag_duplicate still records the event in stripe_events, so it advances the newer-event check like any applied event.
- SQL verified offline in a scratch postgres (stubs + the migration's table/function text): rp_other conflict, flag_duplicate applied twice → 1 notification, same-sub conflict, grace → record_payment replaces; removing the record_payment guard flipped rp_other to applied.
- Self-check: `pnpm --filter @bcn-services/connect test` → 333 pass / 0 fail / 0 skip.
