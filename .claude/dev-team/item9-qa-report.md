VERDICT: PASS
## VERDICT: PASS
**Branch:** feat/source-disconnect (QA commit f628a78 on top of 945739c)

Findings (no Critical/Important)
MINOR — apps/connect/lib/sources.ts disconnectCopy (meet/drive branch) — copy says "Google Drive keeps syncing: it is connected separately" even when the other Google source was never connected (the card always renders it); true only when the sibling is connected — fix: pass whether the sibling is connected, or soften to "If Google Drive is connected, it keeps syncing".
MINOR — platform/test/helpers.ts:141 — comment "A non-quickbooks source fails validation" is stale (shopify is what fails now) — reword.
MINOR (CI-only risk, not reproducible here) — platform/worker/src/disconnect.ts alertIfStuck — `$2` used as `$2 || '_revoke_stuck'` and `$2::data.source` in one statement; pg infers text then explicit-casts to the enum, which is legal, so I expect it to pass, but only the CI test "stuck over 24h: a drive_revoke_stuck notification" proves it.

Gates (run myself)
- connect test: 346/0/0 skip -> 350/0/0 after my 4 added (floor 341); source-disconnect.test.mjs and new source-disconnect-role.test.mjs both in the literal list in apps/connect/package.json (count rose)
- platform test: 18 files / 192 pass, 0 fail (floor 174); 21 DB test files SKIPPED locally (ECONNREFUSED 54322), including quickbooks-disconnect.test.ts, catalog, rpc-*, tenant — CI only
- connect typecheck, connect lint, connect build, platform typecheck: all clean
- Deleted quickbooks-disconnect.test.mjs: all 5 behaviours carried over (cross-site refusal, no-session forbidden, guard order + POST-only + no token/provider calls, canDisconnect matrix incl. member/shopify/none, page <details> control/no window.confirm) in source-disconnect.test.mjs; no coverage lost

MUT2a gap closed: new apps/connect/tests/source-disconnect-role.test.mjs (committed). @bcn-services/tenant replaced in require.cache so lib/session.ts runs unmodified; member session -> 303 ?error=forbidden and zero RPC calls (all 5 sources); owner -> exactly api.disconnect_source {p_source}; shopify/unknown never reach RPC; BCNS2 -> forbidden, other -> disconnect-failed. No refactor needed.

Mutations (cp backup, restored, shasum identical, git status clean after each)
a1. meta case returns 'revoked' without the DELETE -> RED, disconnect-upstream "revokeUpstream: meta" (2 tests: expected [] length 1; 190 not already_invalid)
a2. meet short-circuits before Google fetch -> RED, "revokeUpstream: meet (Google)" (4 tests)
b1. ownerSession -> memberSession in route -> RED, my new test "a signed-in MEMBER is refused ... no RPC call" (behavioural, not source-text) plus the source-text order test
b2. `if (!session)` guard deleted -> RED, new MEMBER test + "every disconnectable source without an owner session is forbidden"
b3. isDisconnectable guard bypassed -> RED, "owner posting shopify or unknown never reaches the RPC" + "Shopify and unknown sources refused"
c1. shopify added to hub DISCONNECTABLE -> RED, allow-list test + owner-shopify route test
c2. shopify added to worker DISCONNECT_SOURCES -> RED, "constants > pins the endpoints and the allow-list to literals"
c3. canDisconnect true for shopify -> RED, "canDisconnect: every source x role x status; Shopify never"
d1. googleRevokeNeeded inverted -> RED, 2 tests in "googleRevokeNeeded (the other Google source)"
d2. call-site decision in revokeOne inverted (`googleRevokeNeeded(sib)` without `!`) -> GREEN locally (192 pass): exercised only by DB tests "drive with meet still connected ... no Google revoke" and "meet and drive both disconnected" — CI-only, not verified here
RPC role check (CI-only, not run): delete the `active_client_role() is distinct from 'owner'` block in 20261007000500 -> DB "api.disconnect_source: owner disconnects %s; a member is refused" (it.each meet/drive/monday/meta, expects BCNS2) must go red.

DB-backed read-through (CI-only, desk-checked against the migration): owner accepted + member BCNS2 for meet/drive/monday/meta, shopify BCNS3 (allow-list in migration; RPC_ARGS shopify->BCNS3 still true), token_kind enum has google_oauth_refresh/monday_personal/meta_system_user, seed/counts handle any source, Google 503 sets provider 'google' down only, stuck 403 is <500 so not "down", both-disconnected Google bodies are token=refresh-secret. Grants re-stated (revoke public/anon/service_role, grant authenticated): catalog tokens_unreachable (function body names data.disconnect_source, not source_tokens) and rpc-record-shop-redact N1 (service_role cannot execute) stay consistent. Migration is last in sequence (20261007000500). All consistent; no failure expected.

Copy check (disconnectCopy, asserted by source-disconnect.test.mjs): quickbooks/meet/drive/monday/meta each say "deletes the <Source> data bcns has stored for this workspace" (worker deletes raw + client rows scoped to that source via deleteRawScoped/deleteClientRows{source}: matches) and "Reconnecting later re-imports everything from the start" (token, schedule, cursor rows deleted: matches). QuickBooks/Meta "cancels its access" matches the Intuit/Graph revoke; Monday gives the admin step and never promises a cancel; meet/drive name the other Google source. No MCP/OAuth/token/backfill/cursor. Only gap is the MINOR above (sibling "keeps syncing" shown when sibling not connected).

Tests added: apps/connect/tests/source-disconnect-role.test.mjs (4 tests, wired in apps/connect/package.json)
Not verifiable here: all DB-backed platform tests and the live smoke (no local DB per instructions) -> CI.
