# Engineer Report
**Task:** Item 1 — Stripe self-serve Checkout + payment gate ($200/mo; pending → active on a signed webhook; one grace month then paused; never-paid stays pending; Shopify installs exempt)
**Branch:** feat/stripe-gate
**Date:** 2026-10-06

## Design Decisions
- Decision logic is pure app-core (`billingSignal`, `decideBilling`, `billingView`); the Edge Function runs a byte-identical copy (`_shared/app-core/subscription.ts`) pinned by a parity test.
- Two independent verifiers: node:crypto in app-core (hub route) and WebCrypto in the Edge Function; both HMAC `${t}.${body}`, 300 s tolerance, constant-time compare, fail closed.
- Hub verifies then forwards raw body + Stripe-Signature to the `stripe-webhook` Edge Function (service role lives only there); the hub holds no service-role key.
- Webhook route is `/api/webhooks/stripe`, not `/api/stripe/webhook`: the middleware matcher already excludes `api/webhooks/`; `/api/stripe/*` would 307 Stripe to /login (test pins this).
- Every guard is repeated in SQL (`api.stripe_apply_billing`): status precondition per action, never from churned, Shopify-billed exemption, newer-event check, per-client advisory lock, event-id dedupe; a lost race returns `conflict` → 503 → Stripe retries.
- Grace expiry is a worker tick step (`data.pause_lapsed_clients()`), because Stripe sends no event at grace_until; nothing auto-churns.
- Shopify exemption = public-app Shopify schedule with a live token AND `paid_at is null` (a Stripe payer can't hide behind a later Shopify connect); unknown/missing flag fails toward exempt.
- Paused (after paying) owners now get a tenant-less token like pending so they can sign in to /pending and pay to resume; churned stays 403 (behaviour change, see flags).
- `billing_self` returns unix seconds (same as `stripe_billing_state`); the client always comes from auth.uid(), never from a form field.
- In-hub grace UI: banner in layout.tsx (`.note note-alert`) linking owners to /pending, which renders a `.sc` card for a member in grace; pending/paused render in the existing sign-in Frame.

## Files Changed
- `packages/app-core/src/subscription.ts` — billing signal/decision/view logic, new Stripe statuses, GRACE_SECONDS.
- `packages/app-core/src/webhooks.ts` — `verifyStripeSignature`, `stripeVerifier`, STRIPE_TOLERANCE_SEC.
- `packages/app-core/src/index.ts` — exports.
- `packages/app-core/package.json` — `tests/stripe.test.mjs` appended to the test chain.
- `packages/app-core/tests/stripe.test.mjs` — 15 tests over recorded fixtures (verifier, signals, decisions, views, processWebhook wiring).
- `packages/app-core/tests/fixtures/stripe/*` — 6 hand-written events in Stripe's documented 2025-03-31.basil shape + README.
- `packages/tenant/src/membership.ts`, `packages/tenant/tests/membership.test.mjs` — `paused` claim treated like pending.
- `packages/data-client/src/database.types.ts` — `pending` in status unions, `billing_self`.
- `platform/supabase/migrations/20261007000100_stripe_billing.sql` — clients billing columns, `data.stripe_events`, `data.shopify_billed`, `api.billing_self`, `api.stripe_billing_state`, `api.stripe_apply_billing`, `data.pause_lapsed_clients`, hook update.
- `platform/supabase/functions/stripe-webhook/{handler,index}.ts` — Edge Function (verify, size cap, decide, apply).
- `platform/supabase/functions/_shared/stripe-signature.ts` — WebCrypto verifier.
- `platform/supabase/functions/_shared/app-core/subscription.ts` — copy of app-core subscription.ts.
- `platform/supabase/functions/_shared/deps.ts` — `stripeWebhookDeps()` over the two service-role RPCs.
- `platform/worker/src/tick.ts` — `pauseLapsed` housekeeping step.
- `platform/test/edge-stripe-webhook.test.ts` — 15 tests (parity, verifier, handler).
- `platform/test/stripe-billing.test.ts` — DB test of the RPCs, guards, grace/pause/resume, hook (skips without local stack).
- `platform/test/helpers.ts` — new RPCs in the service-role-only and RPC-args lists.
- `platform/test/signup.test.ts` — paused no longer 403 at the hook; churned still is.
- `apps/connect/lib/stripe-billing.ts` — billing_self parse/load, Checkout + portal sessions via fetch, Stripe host check, webhook verify-and-forward route.
- `apps/connect/app/api/webhooks/stripe/route.ts` — POST route.
- `apps/connect/app/pending/actions.ts` — startCheckout, openBillingPortal, finishActivation.
- `apps/connect/app/pending/page.tsx` — pay / paused / finishing-up / grace / pending-review states.
- `apps/connect/app/billing-banner.tsx`, `apps/connect/app/layout.tsx` — grace banner.
- `apps/connect/lib/env.ts`, `apps/connect/.env.example` — STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, STRIPE_WEBHOOK_FUNCTION_URL.
- `apps/connect/package.json`, `apps/connect/next.config.mjs`, `pnpm-lock.yaml` — app-core workspace dep + transpile; test list gains stripe-billing.
- `apps/connect/tests/stripe-billing.test.mjs` — 11 tests.
- `apps/web/lib/content.ts`, `apps/web/CONTENT.md` — Stripe subprocessor live, billing line in "What we collect", "Fees and billing" (card via Stripe, Shopify installs billed by Shopify, grace then pause), FAQ "How do I pay?" appended, dates bumped.

## Deferred / Out of Scope
- Checkout terms-consent box (`consent_collection`) — needs the ToS URL set in the Stripe dashboard first; acceptance sentence left as is.
- Self-serve cancel in the portal — depends on Nate's portal configuration; copy still says cancel by email.
- Edge Function not type-checked under Deno (no deno locally); covered by vitest importing handler.ts.
- DB test (`stripe-billing.test.ts`) not run locally (no `supabase start` per guardrail); CI runs it.

## Flags for Reviewer
- Two parallel Checkouts before a customer id exists could create two subscriptions; paying anew during grace while an `unpaid` subscription still has open invoices could double-charge if those are later paid.
- Fixtures are hand-authored to the documented basil shape, not live captures.
- If the worker deploys before the migration, the `pauseLapsed` step errors, is logged, and the tick continues.
- Layout now calls `api.billing_self` once per signed-in page render (fails soft to no banner).
- Hub accepts only `checkout.stripe.com` / `billing.stripe.com` redirect hosts; a Stripe custom domain would need adding.
- Behaviour change: paused owners can sign in (tenant-less) to /pending; client apps still treat that token as no-membership.
