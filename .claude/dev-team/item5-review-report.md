# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 5

## Findings

### Important
IMPORTANT — platform/worker/src/health.ts:219-222 (`fmtMoney`) — every connector stores money as `round(amount * 100)` whatever the currency (`minor()` at worker/src/connectors/index.ts:116, used by shopify.ts:255/274/286 and meta.ts:251; DESIGN.md:816 and :871 say the same). `fmtMoney` instead divides by the currency's own decimal places. So a JPY shop's ¥5,000 order is stored as 500000, and the email says "Sales: ¥500,000", 100 times too high. A 3-decimal currency (KWD, BHD) comes out 10 times too low. The test at test/weekly-digest.test.ts:98-101 locks in the wrong behaviour by feeding a raw 5000. — Fix: always divide by 100 (`f.format(minor / 100)`), and change the JPY test to `revenue_minor: 500000` → expect `¥5,000`.

### Minor
MINOR — platform/test/worker.test.ts:318-322 — the "same week again" check never asserts that the second `run()` held the housekeeping lease. If that tick doesn't get the lease, `weeklyDigests` never runs, and the "no new row, no new email" assertions pass without testing the dedupe. — Fix: `expect((await run()).housekeeping).toBe(true)`.
MINOR — platform/DESIGN.md:1145 — the doc says ad spend alone makes the week count as data. The code (health.ts:202) only counts ad spend that has a currency (`ad_currency ?? currency`). A spend row with no currency on a day with no money is dropped, and the week is skipped. — Fix: add "with a currency" to the ad-spend clause in the doc.

## Probes run
- Callers: `raiseWeeklyDigests` is only called from tick.ts:91, inside the housekeeping lease, after `shopRedact` and before `alerts`, so the digest goes out in the same tick. `digestEmail` and `lastWeek` are only called from `sendPending` and the tests. The `HUB_URL` export is harmless.
- `lastWeek`: checked 87,462 instants from 2019 to 2030 in 6 time zones (NY, Kiritimati +14, Pago Pago -11, London, Lord Howe with its half-hour DST shift, UTC). In every case `start` is a Monday and the label equals the ISO week of `start`: 0 mismatches. It works on local clock time, so DST changes can't move the week.
- Dedupe and retries: the pre-check is a shortcut only; `on conflict (dedupe_key) do nothing` is the real gate. The key is client plus ISO week, so it is the same at every site that builds it. A resend reuses `Idempotency-Key = dedupe_key`. A failed send increments `attempts` up to 5, then `notifications_stuck` fires.
- Who gets it: only `active` clients get a digest row; `pending`, `paused` and `churned` get none. The owner-only branch is shared with break emails. With no owner, the row is marked sent with "no owner to email". The tenant ID comes from the row's `client_id`; the view query is scoped by `client_id = $1`.
- No-data rule: the view's coalesced zeros come with `currency` null when a day has no money rows, so a client with only inventory rows gets no digest. This matches the production premise.
- DB-backed test checked against seed.sql: acme is active, NY time zone, has an owner, and has 50 days of data ending today. beta is active, LA, and has a member but no owner. gamma is paused. `mkClient` creates clients as `active` by default (schema.sql:25), so the "empty" and "inventory only" assertions really test something. `inventory_units` exists in `metric_defs`, so the inserted row is valid. No earlier `tick()` in the file raises digests, and later ticks don't assert on email or notification counts. `digestBatches` filters on the Idempotency-Key, so break-email batches are excluded.
- Test runner: `vitest run`, include `test/**/*.test.ts`. Ran in the worktree: 17 files, 177 passed, which is above the floor of 160. weekly-digest.test.ts is included.
- Copy: no jargon, no reply or unsubscribe promise, and the hub link is the only call to action.

## Follow-ups (pre-existing, not this diff)
- apps/connect/lib/data-format.ts:27-31 `currencyDigits` makes the same mistake for JPY and KWD in the hub.
- api.daily_summary_v1 picks one currency per day with `max(currency)`, so orders in two currencies on the same day are summed under one label.

## STANDARDS.md Updates
none (caller barred repo edits)
