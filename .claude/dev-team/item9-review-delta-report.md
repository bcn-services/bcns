REVIEW: 0C/0I/2M
# Review Report
**Date:** 2026-10-07
**Files Reviewed:** 10 (git diff 51d5b76..HEAD, fix round 1, excluding the engineer report)

## Findings

### Minor
MINOR — apps/connect/app/sources/[source]/page.tsx:43 (used at :191) — this is the engineer's flag, and it does matter. A tenant has Meet and Drive both connected. The owner opens /sources/meet, the connector_health_v1 read fails for a moment, and source_settings_v1 succeeds, so the Disconnect panel still renders. health.data is null, every card comes back "none", and the confirm text says "bcns also cancels its access to your Google account". The worker sees drive active and keeps the grant (kept_for_sibling), so the owner is told their Google access is cancelled when it isn't. The Sources page can't hit this, because there a failed read hides every Disconnect control. Fix: when health.error is set, show a sentence that is true either way ("Google removes bcns's access once both Google Meet and Google Drive are disconnected.") instead of the not-connected text.
MINOR — apps/connect/lib/sources.ts:251 — when the other Google card reads "Reconnect needed" (token auth_failed), googleSiblingConnected is true and the confirm text says "Google Drive keeps syncing", but Drive syncs nothing until it is reconnected. The grant part does match the worker, since auth_failed keeps the grant. Fix: say "stays connected" instead of "keeps syncing". That is true in every state other than "none" (ok, stale, error, auth_failed, never_ran).

## Desk-checks with no finding
- Hub vs worker "connected", state by state. A health row exists exactly while the token is not revoked. attach_source seeds never_ran. disconnect_source and revoke_shopify_install delete the row. computeHealth deletes rows for any revoked token every tick and upserts rows for every active-client schedule whose token is not revoked, whatever `enabled` says. So:
  - sibling active (never_ran, ok, stale, error, schedule disabled, client paused): card connected, worker keeps the grant.
  - sibling auth_failed: card "Reconnect needed", worker keeps the grant.
  - sibling revoked by an owner: health row deleted in the same RPC, worker revokes.
  - sibling revoked by an operator: the hub can show connected until the next computeHealth, which runs every tick. Negligible.
  - sibling has a schedule but no token, or a token but no health row: no write path produces either.
  - health status is NOT NULL, so asStatus never maps an existing row to "none".
- Lock and starvation:
  - Lock contention never makes a run wait, because rows another transaction holds are skipped (`skip locked`), so overlapping meet and drive runs cannot deadlock.
  - The sibling-skipped null path needs the sibling row locked at the instant each tick runs the select. The only lockers are refreshOne (one refresh HTTP call, about hourly), the attach_source upsert, and the status updates in probeAuthFailed and run.ts. Each holds the lock for seconds at most, and housekeeping's own refreshTokens finishes before revokeDisconnected starts.
  - The own-row and lease null paths (lease ≤8 min, cleared by reap) are also temporary. None of the null paths is permanent, so missing alertIfStuck on them is not reachable.
  - For quickbooks, meta and monday, $3 is null, so `source = null` matches no row, which is correct.
- New DB tests, CI-only, desk-checked to pass:
  - The operator-meet test makes one Google call, deletes drive, leaves meet revoked/operator, and logs outcome 'revoked'.
  - In the held-meet test, the skip-locked select returns drive only. The sibling-existence select does not take a lock, so the held lock doesn't block it, finds meet, and the run returns null with 0 calls and drive kept (ALL). After the rollback, meet is active, so the result is kept_for_sibling with 0 calls and drive deleted (NONE).
  - fileParallelism is false and earlier tests clear their own due rows, so the call counts belong to each test.
- Revert check (desk-checked, not run in a throwaway worktree because of the ~/bcns guardrail):
  - With the old googleRevokeNeeded, `{status:'revoked'}` returns false, so the test goes red.
  - With the old blocking sibling lock, the held-meet test hangs, then fails at testTimeout.
  - The old disconnectCopy fails the alone/endsWith assertions.
  - googleSiblingConnected doesn't exist on the old code, so the import fails.
  - The engineer's mutation results match all of this.
- Wiring: apps/connect pnpm test re-run here gives 352/0/0 (floor 350), and source-disconnect.test.mjs is in the literal list. disconnect-upstream.test.ts passes 18/18 and is picked up by the vitest glob.
- Tenant scoping: the per-source page's health read goes through RLS `client_id = active_client_id()`, the same as the Sources page. It never reads source_tokens, which the test pins.
- Copy sweep: NOTES.md #9 and the DESIGN §5.9b wording agree with the new rule. No other surface repeats the Google confirm text.

## STANDARDS.md Updates
none (instructed: no repo edits)
