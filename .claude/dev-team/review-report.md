REVIEW: 0C/0I/5M
# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 4 (health.ts, break-emails.test.ts, worker.test.ts, DESIGN.md) — diff da54d22..0aeaf28

## Findings

### Minor
Minor — platform/worker/src/health.ts:180 — a `stale` that comes from failing runs (provider outage, a connector bug) or from computeHealth's zero_now rule (a Monday board or Drive folder that really is empty) emails "Reconnecting fixes it, and your information picks up again on its own." The owner reconnects, nothing changes, and three days later they get the reminder anyway. — for `stale`, soften the line to "Reconnecting usually fixes it. If it doesn't, reply to this email and we'll sort it out."
Minor — platform/worker/src/health.ts:111 — the key is per `status_since`, and status_since changes on every status change. One outage that never recovers, going stale (email 1, "hasn't updated since") and then auth_failed when the token dies (email 2, sent at once), sends the owner two "reconnect" emails and two reminders. Prod history shows re-breaks only after ok runs, so this has not happened yet. — key the breakage on `connector_health.last_success_at` (with 'never' when null), which only moves when a sync succeeds; the bcns alert keys stay as they are.
Minor — platform/worker/src/health.ts:125 — the reminder only checks the client_break row's created_at, not whether that row was ever sent. If Resend is misconfigured for 5 ticks, the first email gets stuck at attempts=5. After 3 days the owner gets "A quick reminder: … still not connected" as their first and only email. — gate the reminder on `sent_at is not null and last_error is distinct from 'no owner to email'` from the initial row, or let the reminder's wording fall back to the first-email copy.
Minor — platform/worker/src/health.ts:191 — the Idempotency-Key is reused on retry while the body is rebuilt from the current owner list. Scenario: Resend accepts the request but the response times out, and an owner is added before the next tick. Resend then answers 409 (same key, different payload) on every retry until attempts=5, and the row sits in notifications_stuck even though the email went out. Low odds. — on a 409 `invalid_idempotent_request`, mark the row sent.
Minor — platform/worker/src/health.ts:136 — nothing tests the `c.status = 'active'` filter. Deleting it leaves all 158 tests green, because seeded gamma is paused but its health is never_ran. DESIGN.md claims "Only active clients are emailed." — in client_break_emails, also set a gamma health row to auth_failed and assert that no client_break row exists for gamma.

Probes run (no finding):
- Resend batch: the default strict validation is all-or-nothing, so a batch never partly succeeds. The key is about 95 chars, under the 256 limit. One message per owner.
- Key precision: the key is built in JS from the pg-parsed Date at both the insert site and the lookup site, so it is identical across ticks. A microsecond-to-millisecond collision would need two transitions in the same millisecond.
- bcns path: the bcns rows are untouched. When BCNS_ALERT_EMAIL is unset, bcns rows fail as before. Client rows send if BCNS_ALERT_FROM is set and fail with attempts++ otherwise. They never take a bcns row's attempts.
- No owner: the row is marked sent with last_error, so it stays out of notifications_stuck and out of the 50-row window. The sendPending order and limit are unchanged.
- Callers of `alerts()`: only tick.ts step logging uses the return value, and no test asserts `steps.alerts`.
- Prod (SELECT only): 0 sources are auth_failed or stale today, so deploy sends no burst of emails. The worker logs in as the postgres role, which can read auth.users. The shopify-review tenant has 1 owner, who will be emailed if its source breaks.
- DB test in CI: acme has 1 owner, 1 member and 1 smoke member in the seed. The leftover auth_failed client from alert_retry has no owner, so it is marked sent and makes no batch call, and the batch count of 1 then 2 holds. `finally` restores acme's health row and deletes acme's notifications, so health_one_row's row count is unaffected. alert_retry still passes: it filters by its own dedupe_key, and its client_break row takes the no-owner path with no fetch.
- Wiring: vitest includes `test/**/*.test.ts`, and break-emails.test.ts does not import ./helpers. 146 → 158.

## STANDARDS.md Updates
- Platform Worker / Outbound email goes through data.notifications
- Platform Worker / Dedupe keys come from row state, never the clock
- Platform Worker / Pure layer in its own test file
