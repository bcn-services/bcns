REVIEW: 0C/0I/3M
**Branch:** feat/stripe-gate @ b6c38f7
# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 19 (delta 98b1255..b6c38f7, scoped re-review)

## Prior findings
- I1 CLOSED: checkoutTarget (stripe-billing.ts:225-230) looks up a live sub first (by stored customer, else metadata search) and fails closed. Original scenario re-run: slow webhook + Pay again → `/pending?paid=1&waiting=1`; grace "Update payment" → portal while A is live; a new Checkout only after A ended. Search-lag duplicates → flag_duplicate keeps A, one notification. Scratch postgres: rp_other=conflict, flag twice=1 alert, same-sub flag=conflict, grace record_payment replaces.
- I2 CLOSED: `/login?next=finish` sign-in and `/signup?from=shopify` set `bcns_shopify_install`; pendingScreen → review, no Pay. Cross-browser case falls back to the Pay-screen line (see new Minor 2).
- M1 CLOSED: stripeReady needs all four values (stripe-billing.ts:83).
- M2 OPEN (deferred to PR Nate-steps, not written anywhere in-repo yet): see new Minor 3 for the sharper wording now needed.
- M3 CLOSED: DEPLOY.md:171-175 has deploy `--no-verify-jwt` + `secrets set STRIPE_WEBHOOK_SECRET=<signing secret>`.

## Findings

### Minor
Minor — packages/app-core/src/subscription.ts:166 (+ migration:155-156) — the stale check runs before the duplicate check: two Checkouts inside the ~1 min search lag, sub A's events delayed (hub forward 502, Stripe retries), B's newer events activate first, then A's older paid events are dropped as `stale`. No alert until A renews a month later, so the owner pays an extra $200 before bcns hears. Fix: decide flag_duplicate before the stale return and exempt `flag_duplicate` from the SQL newer-event clause; it never changes the client row, so this cannot loop.
Minor — apps/connect/app/pending/page.tsx:149 — Shopify merchant opens the confirm email in another browser, so no marker: the Pay screen says "don't pay here" but gives no next step, and nothing tells bcns. They sit on pending. Fix: append "email {BCNS_EMAIL} and we'll open it for you".
Minor — apps/connect/lib/stripe-billing.ts:155 — `unpaid` now counts as live, so every Pay click on a grace or paused client goes to the billing portal. If Nate sets Stripe's "after all retries fail" to "mark unpaid" and the portal can't settle the open invoice, a paused owner can never start a new subscription. Fix: the PR Nate-step should say "cancel the subscription", not "mark unpaid".

## Probes and checks run
Cookie (security battery): httpOnly, SameSite=Lax, Secure when the hub is https, path /, 30 days, value "1". It is read only by /pending (pendingScreen) and only hides Pay; checkoutTarget ignores it. Cross-site setting is blocked by the server-action origin check. Distinct name, and the finish route, middleware matcher and Shopify cookies are unchanged. A non-Shopify owner is not stuck forever: only the Shopify hand-off sets it, it lasts 30 days, and they fall back to the pre-item review path.
Stripe lookup (security battery): client id must match a lowercase-UUID regex before entering the search query (injection test plus mutation red). The query is URLSearchParams-encoded, the host is constant, and logs carry only the path. `has_more: true` with no live sub → fail closed. 5xx, timeout, non-JSON or missing data → fail closed. Portal customer is regex-checked.
SQL: guards are in the UPDATE WHERE and mirror decideBilling exactly. The status guard covers flag_duplicate. Event-id dedupe returns `duplicate` on retry. The notification uses dedupe_key ON CONFLICT DO NOTHING. kind is free text, emailed by sendPending like the other kinds. Deno copy byte-identical (shasum df53adb7…).
Mutations (throwaway worktree, cp-restored, all red on the intended assertion): live gate, fail-closed, has_more, `unpaid` status, UUID guard, pendingScreen marker, grace→portal, signIn/signUp cookie, page cookie read, login link, signup hidden input, httpOnly. Also decideBilling flag (app-core, and Edge behaviour test with both copies mutated) and its grace condition. SQL record_payment guard and flag_duplicate guard each went red in scratch postgres 17.
Counts: connect 325→333, app-core stripe 15→16, edge-stripe-webhook 15→16; DB file +1 (skips locally, CI runs it). tsc clean in connect, app-core and platform.

## STANDARDS.md Updates
none (scoped re-review; caller forbade repo edits)
