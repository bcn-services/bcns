REVIEW: 0C/1I/3M
# Review Report
**Date:** 2026-10-07
**Files Reviewed:** 17 (git diff fdc9579..HEAD, excluding the two dev-team reports)

## Findings

### Important
IMPORTANT — apps/connect/lib/sources.ts:236 (rendered by app/page.tsx:231 and app/sources/[source]/page.tsx:185) — an owner with only Google Meet connected opens Disconnect and reads "Google Drive keeps syncing: it is connected separately", but Drive is not connected and nothing syncs; the run's rule is that client copy promises only what the code does, and done-when asks for what happens to the other Google source, which here is stated wrongly. Most tenants have at most one Google source, so this is the normal case — fix: pass whether the sibling card's status is not "none" into disconnectCopy (both callers already have it: `cards` on the Sources page; `source_settings_v1` rows on the source page) and only say "keeps syncing" when it is connected; otherwise drop that sentence (or say "Google removes bcns's access when this is disconnected").

### Minor
MINOR — platform/worker/src/disconnect.ts:101 + platform/DESIGN.md:1222 — googleRevokeNeeded skips the Google revoke whenever the sibling row exists in any state other than revoked/owner_disconnect, including an operator-revoked row (status revoked, other detail, never auto-deleted) whose card reads Not connected: an owner disconnecting Meet then keeps the Google grant indefinitely, although DESIGN says "while the other Google source still has a live token" and the copy says access goes once both are disconnected — fix: treat only `status in ('active','auth_failed')` as a live sibling, or make DESIGN state the real rule.
MINOR — platform/worker/src/disconnect.ts:121-133 — lock order is "own row (skip locked) then sibling row (blocking for update)"; if two housekeeping runs overlap (lease expiry on a long tick), one takes drive and the other meet for the same client and each blocks on the other's sibling → Postgres 40P01, one rolls back, google marked down for that tick (self-heals next tick, no data loss) — fix: lock both Google rows in one `select … where source in ('meet','drive') order by source for update` before deciding.
MINOR — platform/test/helpers.ts:141 — comment "A non-quickbooks source fails validation" is now false (meet/drive/monday/meta pass validation; only shopify/null fail) — reword to "Shopify fails validation".

## Desk-checks with no finding
- alertIfStuck `$2 || '_revoke_stuck'` + `$2::data.source`: target list is analysed before WHERE, so $2 resolves to text (unknown||unknown → text||text) and the later explicit text→enum cast is a legal I/O coercion; no "inconsistent types" error (same pattern as the pre-existing `$1::uuid` / `|| $1 ||`). notifications.kind is unconstrained text; sendPending is kind-generic.
- Media cleanup: paths come from data.media filtered by client_id+source inside the locked tx and are removed only after commit; Meta paths are `<client>/orig/<uuid>`, Drive thumbs `<client>/thumb/<driveFileId>`, generated thumbs `<client>/thumb/<media uuid>` — none can name another client's or another source's object. Reconnect-then-resync inside the single storage call after commit is the only overlap (drive thumb path is deterministic); negligible window, not reported.
- Migration: security definer, search_path '', owner check before allow-list, null refused, grants re-stated (authenticated only, service_role revoked) — catalog tokens_unreachable, N1 allow-list, RPC_ARGS shopify→BCNS3 all still hold. data.source enum has all five values.
- Route: cross-site → allow-list → ownerSession → RPC; redirect target is the config hubBaseUrl and `source` is allow-listed before it is echoed; Shopify unreachable (allow-list in hub, RPC, worker DUE). Next 14.2 → sync params is correct. Middleware matcher covers /api/sources.
- Provider mapping: Google 400 invalid_token, Meta error.code 190, Intuit 400 invalid_grant → already_invalid; meta token sits in the query string but only reason()/redact()ed text is logged. down-set per provider; deadlock/DB errors also mark that provider down for the tick only.
- Wiring: both new connect test files are in apps/connect/package.json's literal list (QA: 341→350); platform uses `vitest run` (glob), disconnect-upstream.test.ts counted (174→192).
- Not reported (engineer-deferred, pre-existing): apps/web/lib/content.ts:953 + apps/web/CONTENT.md:1088 still say the hub disconnect has not shipped; purge orphan sweep ignores thumb/.

## STANDARDS.md Updates
none (instructed: no repo edits)
