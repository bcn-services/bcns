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

---
# CI fix round 1
**Task:** PR #126 CI run 37577786142, `test` job: 2 failed / 378 passed (380), 37 files. Both failures are pre-existing tests pinning the paused / service_role behavior this item changed on purpose. The `apps` job failure (`@bcn-services/sb#build`, `next/font` Google Fonts fetch) is a network flake in an untouched app: no change.
**Branch:** feat/stripe-gate
**Date:** 2026-10-06

## Premise check (from the CI log and the migration)
- `hook_mints_claims` failed at line 98: `expected undefined to match object { http_code: 403 }`. Its later `signIn(USERS.gammaMember)).rejects` line never ran and would have failed the same way.
- N1 failed: received 5 names, expected 3. `20261007000100_stripe_billing.sql` grants execute to service_role on exactly `api.stripe_billing_state` (l.101-102) and `api.stripe_apply_billing` (l.172-175); `api.billing_self` is revoked from service_role (l.78) and granted only to authenticated. The migration creates no api view or table, so N1's `role_table_grants` companion stays `[]`.
- Other platform tests pinning the old paused behavior: none. Grep for gamma/paused/http_code/403/client_status/signIn: `signup.test.ts` was already moved to churned-only in this item; `stripe-billing.test.ts` already asserts the new paused hook; `tenant.test.ts`, `data-client.test.ts`, `edge-*` 403s are churned / no-membership / owner checks that the migration leaves alone; `worker.test.ts` only lists gamma as seeded, and `pause_lapsed_clients` cannot touch the seed (`paid_at` is null on every seeded client).

## Files Changed
- `platform/test/catalog.test.ts` — `hook_mints_claims`: paused gamma now returns no error and claims exactly `{ role: 'authenticated', client_status: 'paused' }`. A GoTrue sign-in carries `client_status: 'paused'` with no `client_id` and no `client_role`, and every api view returns `[]` to that token. The `nobody` 403 assertion stays.
- `platform/test/rpc-record-shop-redact.test.ts` — N1 expected list gains `stripe_apply_billing`, `stripe_billing_state` (exact sorted equality kept); title names the two Stripe billing RPCs.

## Mutation proof by reading (DB tests skip locally; CI runs them)
- New hook (migration l.197-217), gamma `paused`: `rec.status in ('pending','paused')`, so it returns `jsonb_set(event,'{claims}', claims - 'client_id' - 'client_role' || {client_status: rec.status})`. The input claims are `{"role":"authenticated"}`, so the output has no `error` key (`toBeUndefined` passes), claims equal `{role, client_status:'paused'}` (`toEqual` passes, which also rules out client_id/client_role), and GoTrue issues a token with the marker and no tenant claim.
- Pre-item hook (`20261001000200_signup_pending.sql`): only `rec.status = 'pending'` signs in tenant-less; `paused` reaches `rec.status <> 'active'` and returns `{error:{http_code:403, message:'client paused'}}` with no `claims`. Then `paused.error` is defined (fails `toBeUndefined`), `paused.claims` is undefined (fails `toEqual`), and `signIn(gamma)` throws on GoTrue's 403 (the test goes red at that await).
- A hook that kept the tenant claim for paused (e.g. `claims || {client_id, client_role, client_status}`) fails `toEqual` on the direct call and both `not.toHaveProperty` lines on the GoTrue token.
- Views loop: `data.active_client_id()` (`20260912000200_access.sql`) needs `m.client_id = data.jwt_client_id()` AND `c.status = 'active'`. The paused token has no `client_id` claim, so it is null and every RLS policy (`client_id = active_client_id()`, enforced by `rls_every_table`) returns zero rows, though gamma has seeded rows. Same mechanism `no_claim_zero_rows` relies on for `nobody`.
- N1 against the new migration: service_role executes record_app_uninstalled, record_shop_redact, signup_create_client (unchanged) + stripe_apply_billing, stripe_billing_state (l.102, l.174), which matches the CI log's 5 received names. Against the pre-item schema the two functions do not exist, so the received list is 3 and the new 5-name expectation fails. Granting `api.billing_self` to service_role would add a sixth name and fail the exact equality.

## Local gate
- `pnpm --filter @bcn-services/platform typecheck` → exit 0 (tsconfig `include` covers `test/`, so both edited files are type-checked).
- `pnpm --filter @bcn-services/platform test` → `Test Files 16 passed (16)`, `Tests 162 passed (162)`; 21 DB test files skipped (local stack unreachable, as expected). Floor 16 / 162 held.
- Lint: platform has no `lint` script, and CI's platform `test` job runs only `typecheck` + `test`, so there is no lint gate for these files. `prettier --check` already warned on both files before this change and is not a CI step.

## Flags for Reviewer
- Both changed assertions run only in CI (DB-backed). The proof above is by reading the SQL, not by execution.
