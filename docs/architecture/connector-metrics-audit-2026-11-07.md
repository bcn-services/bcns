# Connector metrics audit — 2026-11-07

Why: Shopify App Store review 2.1.4 failed on "numbers we show ≠ numbers the platform shows" (multi-currency sums, cancelled orders, refunds, test data). This audit checks whether the same class hits Meta, Monday, Meet, Drive, QuickBooks and the hub/SB stats built on them.

Scope rules: `shopify.ts`, `apps/connect/lib/data-stats.ts` and `daily_summary_v1` are owned by #222 (merged) and untouched here. Items needing them are tagged **after #222**.

Evidence key: **P** = read-only prod SELECT (project `cnsxbglhredokjbvudfd`, 2026-11-07); **T** = test in this PR; **C** = code read only (no prod data exists to test against).

## Fixed in this PR

| # | Bug | Fix | Evidence |
|---|-----|-----|----------|
| 1 | Meta incremental refreshed 3 days back; Ads Manager default attribution is 7d click + 1d view, so purchases/purchase_value for days 4–7 stayed stale | `REFRESH_DAYS = 7` (`meta.ts`) | T `meta-account-day.test.ts` |
| 2 | Meta `time_range` and cursor used UTC "today"; Meta's `date_start` is in the **ad account** timezone, so a non-UTC account got a wrong/short last day | `acctDay()` via `localDay(account_timezone)`, falls back to `ctx.timezone` on a bad tz | T same file (Auckland vs UTC; invalid tz) |
| 3 | `api.activity_v1` listed "Task completed" for Monday items and "Campaign updated" for Meta campaigns already tombstoned (`deleted_at`) | migration `20261107130000_activity_feed_skip_tombstones.sql` (`deleted_at is null` on both branches; columns unchanged) | T `activity-skip-tombstones.db.test.ts` (ran against local stack) |

Migration is a Nate-run step (migrations never deploy from a merge). The worker change deploys with `deploy-worker.yml`.

dt-review: pass (0 critical, 0 important). Two accepted minors: the 7-day `since` is an instant minus 7×24h, so on a DST fall-back day the window can be an hour short; backfill depth floor compares in UTC while `until` is account-local (off by at most one day at the depth edge). No test covers the backfill `window_until` default.

## Meta (Ads Manager)

| Stat | Our definition | Platform definition | Match? | Evidence |
|------|---------------|---------------------|--------|----------|
| spend | `minor(p.spend)` ×100, `currency` = account currency (`meta.ts` normalize ~L286–293, `accountMeta` writes config.currency) | Insights `spend`, account currency ([Insights API](https://developers.facebook.com/docs/marketing-api/insights)) | Yes, one currency per account | P bcns-demo single currency; C |
| impressions / clicks / reach | `Number(p.impressions/clicks/reach)` per campaign-day and ad-day (L286–299) | Insights fields of the same name; `clicks` = all clicks (Ads Manager "Clicks (all)") | Yes | C |
| purchases / purchase_value | `omni_purchase` else `purchase` action / action_values (L289–299) | Ads Manager "Purchases" / "Purchase conversion value" with default 7d_click+1d_view | Yes after fix 1 (was stale days 4–7) | T |
| day bucket | account-timezone date (`acctDay`) | `date_start` in account tz ([time_range](https://developers.facebook.com/docs/marketing-api/insights/parameters)) | Yes after fix 2 | T |
| attribution window | not passed → API default 7d_click, 1d_view | Ads Manager default same | Yes | C |
| deleted/archived campaigns | campaign/ad records tombstoned via fullList (`meta.ts` L140); metric rows kept | Ads Manager hides deleted by default, archived shown only under filter; insights still return spend for them | Metrics match the historical report; record counts drop tombstones | P no tombstoned meta rows in prod; C |
| zero-activity days | row skipped when spend, impressions, clicks all 0 (D25, L287) | Ads Manager shows 0 | Equivalent for sums; a day that goes 0 after a late attribution correction would keep the old non-zero row (stale) | C — **larger item** |
| currency change on account | `currency` stored per metric row | n/a | SB sums ignore currency (see consumers) | C |

## QuickBooks (QBO reports)

| Stat | Our definition | Platform definition | Match? | Evidence |
|------|---------------|---------------------|--------|----------|
| entities | `Purchase` + `Bill` (`quickbooks.ts` L29) | QBO "Expenses by Vendor" / P&L cash vs accrual: Purchase = paid expense, Bill = accrued; **BillPayment is correctly excluded** (paying a Bill would double count) | Yes | C `quickbooks.test.ts` |
| amount | `amountCents(TotalAmt)`, truncates to 2 dp (L118) | QBO TotalAmt is 2 dp | Yes | T existing |
| credits | Purchase `Credit:true` negated (L198–206) | vendor refund = money in | Yes | T existing |
| voided | not detected: a voided Purchase stays in the list with TotalAmt 0 and `PrivateNote: Voided` | QBO excludes voided from reports | Amount is 0, so sums match; **count** of expenses includes voided | C |
| deleted txns | Query endpoint never returns deleted rows; no CDC, so a deleted Purchase stays in our table forever | gone from QBO reports | **No** — larger item (CDC endpoint) | C |
| multicurrency | `currency: CurrencyRef.value ?? 'USD'`, amount = `TotalAmt` (transaction currency, **not** `HomeTotalAmt`) | QBO reports in home currency | **No** for foreign-currency txns; `sectorTotals` (SB) skips non-matching currency instead of converting | C — larger item |
| credit memos / vendor credits | `VendorCredit` entity not synced | reduce expenses in reports | **No** (only Purchase `Credit` handled) | C — larger item |

## Monday (board)

| Stat | Our definition | Platform definition | Match? | Evidence |
|------|---------------|---------------------|--------|----------|
| jobs (items) | full-board pull each tick, fullList tombstone on `item→jobs` (`monday.ts` L119) | board items (non-archived, non-deleted via `items_page`) | Yes | P sb: 34 live, 27 tombstoned |
| archived/deleted | gone from `items_page`, so tombstoned on the next full pull | hidden in board | Yes | P |
| done | `is_done = status ∈ done_statuses` (L140) | status label | Yes, as configured | C |
| subitems | not synced | counted separately on the board | Documented gap | C — larger item |
| recent activity | now excludes tombstoned (fix 3) | n/a | Yes after fix 3 | T |

## Meet

| Stat | Our definition | Platform definition | Match? | Evidence |
|------|---------------|---------------------|--------|----------|
| notes count | one `messages` row per Docs doc id under the folder (`meet.ts`, `google.ts` `walkFolder` dedupes by id, `trashed=false`) | Drive folder doc count | Yes at ingest | P sb: 36 notes, 0 duplicate ids |
| trashed after ingest | no fullList, so a doc trashed after being synced stays | gone from Drive | **No** — larger item (zero-row rule is deliberately off for incremental sources) | C |
| re-backfill | upsert `(client_id, source, external_id)` | n/a | Idempotent | P + C |

## Drive

| Stat | Our definition | Platform definition | Match? | Evidence |
|------|---------------|---------------------|--------|----------|
| files count | media rows, fullList tombstones (`drive.ts` L53) | folder contents | Yes: `trashed=false`, folders and shortcuts skipped, dedup by id (`google.ts` L69–97) | C |
| re-backfill | same upsert key | n/a | Idempotent | C |

## Consumers

| Consumer / stat | Our definition (file:line) | Compared against | Match? | Evidence / action |
|-----------------|---------------------------|------------------|--------|-------------------|
| Hub Jobs / Files "30 days" | `fetchCounts30` (`data-query.ts` ~L147) over `updated_at` (jobs) / `created_at` (files), `liveOnly` (`data-views.ts` L207–211, L262–266) | Platform has no "30-day" count; label says activity but counts rows touched | Label/semantics only | **after #222** (`data-stats.ts` labels) |
| Hub Campaigns / Ad creatives "30 days" | counts `campaign_daily_v1` / `creative_daily_v1` rows = campaign-**days**, not distinct campaigns (`data-views.ts` ~L166–187) | Ads Manager campaign count | **No** (5 campaigns × 30 days = 150) | **after #222** (needs distinct count or rename) |
| SB Overview ad spend / purchases | `aggregateCampaigns`, `computeMetaMetrics` sum all rows regardless of `currency` (`overview.ts` L265, L534) | Ads Manager | Yes for single-currency account; wrong after an account currency change | C — larger item (guard) |
| SB Profit | `computeProfit` mixes revenue (Shopify currency) and ad spend (Meta currency) with no check (`financials.ts` L232, L285, L427) | n/a | Wrong if currencies differ | C — larger item (guard) |
| SB expenses (QBO) | `toQboTxn` / `sectorTotals` skip txns whose currency differs from reporting currency (`financials.ts` L553, L652) | QBO home-currency report | Under-counts; safe but not equal | larger item (HomeTotalAmt) |
| SB briefing | `jobs_v1` with `deleted_at is null` (`briefing.ts`) | Monday board | Yes | P |
| Weekly digest | `api.daily_summary_v1` (`health.ts` L291) | Shopify Total sales | Fixed by #222 | — |
| MCP | exposes `money_v1` raw including cancelled orders and refund rows (`policy.ts` L8–34) | Shopify | **No** (agent sees cancelled orders as orders); `daily_summary_v1` is also exposed and correct | larger item |
| Recent Activity | `api.activity_v1` | sources | Fixed (fix 3); order branch still lists cancelled Shopify orders | **after #222** (money branch is Shopify-semantics; leave with the daily_summary owner) |

## `minor()` callers

`minor = Math.round(Number(x) * 100)` (`connectors/index.ts` L133). Callers: Meta (spend, purchase_value, `meta.ts` L286, L299), Shopify (owned by #222). Hub contract: every connector stores ×100 for every currency and display uses `Intl` digits, so 0-decimal (JPY) and 3-decimal (KWD/BHD) currencies display consistently with each other but a 3-dp amount loses its third digit at ingest (precision only; not a mismatch with the platform's 2-dp-rounded views). Meta accounts in 0/3-dp currencies: **C only**, no prod data.

## Idempotency of re-backfill

| Connector | Key | Result |
|-----------|-----|--------|
| shopify | `(client_id, source, external_id)` upsert | out of scope |
| meta | canonical upserts + metrics on `(client_id, source, day, entity_kind, entity_id, metric)` | idempotent; the D25 skip means rows are never deleted on rerun |
| monday | full pull, same key, fullList tombstone | idempotent; deleted-then-recreated item gets a new id |
| meet | `messages` upsert by doc id | P: no dupes after 1+ runs |
| drive | media upsert by file id, fullList tombstone | idempotent |
| quickbooks | `Entity:Id` externalId, `>=` high-water mark re-reads boundary row | idempotent |

## Larger items (effort, no code)

1. QBO deleted/voided txns: add CDC (`/cdc?entities=Purchase,Bill`) to tombstone. ~1 day + test.
2. QBO multicurrency: store `HomeTotalAmt` + `ExchangeRate`, report in home currency. ~1 day; touches SB `sectorTotals`.
3. QBO `VendorCredit` entity. ~0.5 day.
4. Meet trashed docs: periodic list + tombstone (or mark fullList for `drive_file`). ~0.5 day; revisit the zero-row rule.
5. SB Profit and ad-spend: refuse to subtract when currencies differ; show a mismatch note. ~0.5 day.
6. Meta D25 stale-zero: write zero rows inside the 7-day refresh window. ~0.25 day.
7. Monday subitems: add `subitems` to the query or document as out of scope. ~0.5 day.
8. MCP: point agents at `daily_summary_v1` and mark `money_v1` cancelled orders. ~0.25 day.
9. `minor()` for 3-decimal currencies: use per-currency exponent consistently across connectors and display. ~1 day, cross-cutting.
10. **after #222**: hub "Campaigns/Ad creatives, 30 days" distinct count, Jobs/Files 30-day labels (`data-stats.ts`), Recent Activity order branch cancelled orders.

## Verification

- `pnpm exec tsc --noEmit` in `platform`: clean.
- `vitest`: `test/meta-account-day.test.ts` (2), `test/activity-skip-tombstones.db.test.ts` (1, ran against the local stack after applying the new migration with psql), `test/connectors.test.ts` (5): all pass.
- Prod SELECTs were read-only through `mcp__supabase-bcns__execute_sql`; no token columns read.
