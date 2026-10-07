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

---
# Delta review — CI fix round 1
REVIEW: 0C/0I/0M
**Date:** 2026-10-06
**Scope:** `git diff 9fc9cae..389c3ae` (scoped re-review): `platform/test/catalog.test.ts`, `platform/test/rpc-record-shop-redact.test.ts`, `.claude/dev-team/engineer-report.md` (notes only).
**Files Reviewed:** 3

## Findings
none

## Evidence (by reading SQL + the CI log; DB not started locally)
- **hook_mints_claims direct call (catalog.test.ts:100-102)** matches migration 20261007000100 l.207-210 exactly: input claims `{"role":"authenticated"}` minus client_id/client_role, plus `client_status: rec.status` → `{role:'authenticated', client_status:'paused'}`; the return is `jsonb_set(event,...)`, so it has no `error` key. CI run 37577786142 (head 9fc9cae, migration applied) printed `expected undefined to match object { http_code: 403 }` at catalog.test.ts:98, which is direct proof that `.error` is undefined, so the new `toBeUndefined` passes. `toEqual` is exact, so a hook that kept client_id/client_role, or used the wrong marker, goes red.
- **Revert check:** the pre-item hook (20261001000200 l.31-38) lets only `pending` through and returns `{error:{http_code:403,'client paused'}}` for paused. Under it `paused.error` is defined (red at :101), `claims` is undefined (red at :102), and `signIn(gamma)` throws (red at :106).
- **Not loosened: paused still gets no tenant access.** GoTrue token: `not.toHaveProperty('client_id'/'client_role')` (:108-109). Data: every api view through the real GoTrue token → `[]` (:111). That loop is not vacuous. Gamma has seeded rows in every domain table (seed.sql:63-108 loops all clients) plus clients/memberships rows. rls_every_table pins every authenticated policy to `client_id = data.active_client_id()`. active_client_id (20260912000200 l.32-35) needs `m.client_id = jwt_client_id()` AND `c.status='active'`, which is null twice over for this token. No api view references auth.uid() (grep: none in 20260912000400 or later view migrations), so having a membership row does not open any view that `nobody` can't see. `nobody` 403 kept (:103). Churned 403 is still pinned at the hook (stripe-billing.test.ts "churned is still 403 at the hook") and at GoTrue (signup.test.ts:123-131).
- **N1 (rpc-record-shop-redact.test.ts:54-56)** keeps exact sorted equality. The two added names are exactly the migration's two service_role grants (l.101-102, l.172-175). `api.billing_self` is revoked from service_role and public (l.78), so it is correctly absent: granting it would make a sixth name and go red. The migration creates no api view/table, so the `role_table_grants` = `[]` half is unchanged. The CI diff for N1 shows Received = the existing 3 + `stripe_apply_billing` + `stripe_billing_state`, byte-for-byte the new expectation. `SERVICE_ROLE_ONLY_API_FNS` (helpers.ts:110) already lists the same two, so function_privileges and no_claim_zero_rows agree.
- **No other test breaks the same way.** CI on 9fc9cae ran all 380 platform tests with the migration applied: 378 passed and only these 2 failed. `gh api compare da54d22...main` gives ahead_by 0, so the PR merge ref adds nothing new from main. vitest runs with `fileParallelism: false`, and no test file mutates gamma's status (grep), so the seeded `paused` state is stable. The GoTrue sign-in count is unchanged (signIn(gamma) was already called and expected to reject).
- Probes: callers (test-only diff, no prod callers); concurrency/retry (n/a: no runtime code); auth and tenant scoping (above); external call failure path (n/a).

## Notes for the caller (not findings: pre-existing or outside the delta)
- 389c3ae is not pushed yet (origin/feat/stripe-gate = 9fc9cae), so no CI run has executed the new assertions.
- The `apps` job failed at `@bcn-services/sb#build`: a `next/font/google` fetch (`apps/sb/app/layout.tsx:2`, untouched by the item). turbo stopped after 4/7 tasks, so `connect:test` never ran in CI for this PR (only `mcp:test`, 272 pass). Every other recent platform-ci run (6 PR branches + main) passed the apps job, so this is a flake. Rerun, and confirm connect's count is >= 333. Follow-up: switch sb to `next/font/local` like connect/web.

## STANDARDS.md Updates
none (scoped re-review)
