BUILT — feat/source-disconnect — 3fd46eb — self-check: pnpm --filter @bcn-services/platform test && (cd apps/connect && pnpm test) pass
# Item 9 Engineer Report — Disconnect for meet, drive, monday, meta (2026-10-07)
GATES: platform tests 17 files/174 → 18/192 pass (DB-backed quickbooks-disconnect.test.ts skips locally, CI-only); connect 341/0/0 → 346/0/0; platform+connect typecheck pass; connect lint clean; connect build ok (route /api/sources/[source]/disconnect)
COMMITS: 4b35e29 platform (migration, worker, tests); 4102b5a connect (route, control, pages, tests); 3fd46eb docs (code head); this report is the next commit on top
MUT (round 0, all RED then restored byte-identical): drive Google fetch removed; ownerSession→memberSession; `if (!session)` deleted; shopify in DISCONNECTABLE; shopify in worker DISCONNECT_SOURCES; MUT2c (DB, CI-only) owner check removed from migration
PROBE (orchestrator): SB tenant has separate meet + drive google_oauth_refresh rows, both active, different refresh tokens, same Google OAuth client; monday is monday_personal with no refresh token; no meta/quickbooks rows → separate rows on one Google app, hence the sibling rule
## Files
- platform/supabase/migrations/20261007000500_source_disconnect.sql — api.disconnect_source allow-list quickbooks/meet/drive/monday/meta, owner BCNS2, null/other BCNS3, grants re-stated
- platform/worker/src/disconnect.ts — DUE over 5 sources, (client,source) loop, per-source lease, pure revokeUpstream, googleRevokeNeeded + ponytail ceiling, <source>_revoke_stuck, per-provider down set, media file cleanup after commit
- platform/test/disconnect-upstream.test.ts — new DB-free, 18 tests: endpoints, per-provider requests/outcomes, sibling decision
- platform/test/quickbooks-disconnect.test.ts — DB-backed extension: owner/member/worker per source, monday none, meta DELETE, sibling kept/both revoked, drive stuck alarm, Google 503 does not block Meta
- apps/connect/lib/sources.ts — DISCONNECTABLE, isDisconnectable, disconnectPath, generic canDisconnect, disconnectCopy, disconnectedNote
- apps/connect/app/api/sources/[source]/disconnect/route.ts — new single route: cross-site → allow-list → owner → RPC
- apps/connect/app/api/oauth/quickbooks/disconnect/route.ts — deleted (no remaining references)
- apps/connect/app/disconnect.tsx — shared <details> confirm control
- apps/connect/app/page.tsx — card control + generalised banner + generic failure copy
- apps/connect/app/sources/[source]/page.tsx — Disconnect panel on item 8's per-source page
- apps/connect/app/globals.css — .panel .disc form layout
- apps/connect/tests/source-disconnect.test.mjs — renamed from quickbooks-disconnect.test.mjs, rewritten (10 tests)
- apps/connect/package.json — test list names the renamed file
- platform/DESIGN.md — §5.9b Owner disconnect; platform/NOTES.md — Needs Nate #9 (push migration before hub deploy; Monday uninstall; Google grant rule)
## Deviations
- Route is /api/sources/[source]/disconnect (a dynamic segment beside the static api/oauth/* dirs avoided)
- Monday copy: profile picture → Administration → Apps → Uninstall (web-searched; prompt said Admin → API/Developers)
- Worker also removes media storage_path + thumb_path files after commit, best effort (purge's orphan sweep skips thumb/)
- disconnect-failed banner is source-generic; source page treats "connected" as schedule enabled for canDisconnect
- Sibling token row locked `for update` during the decision; RPC refuses null source with BCNS3
## Flags / follow-ups (pre-existing, not fixed)
- apps/web/lib/content.ts ~L953 maintainer comment still says hub disconnect not shipped; privacy copy silent on disconnect
- Sibling rule ceiling: decided per client, not per Google account (ponytail comment in disconnect.ts)
## Fix round 1 (2026-10-07) — review 0C/1I/3M, all 4 applied
- I1 apps/connect/lib/sources.ts disconnectCopy(source, {siblingConnected}) + googleSiblingConnected (other Google card status !== "none"); app/page.tsx passes it from `cards`; app/sources/[source]/page.tsx reads connector_health_v1 (meet/drive only) for it; app/disconnect.tsx threads the prop. Not connected → "bcns also cancels its access to your Google account."
- M2 platform/worker/src/disconnect.ts googleRevokeNeeded: live sibling = status active|auth_failed only (operator-revoked no longer blocks the revoke); DESIGN §5.9b states it; pure tests updated
- M3 disconnect.ts revokeOne: one `… (source=$2 and DUE) or source=$3 order by source for update skip locked`; own row missing → null; sibling exists but skipped → null (next tick); secret read only when revoking
- M4 platform/test/helpers.ts comment → "Shopify fails validation"; DB tests added: operator-revoked meet → Google revoke; held meet lock → no call, drive kept
GATES: connect 352/0/0 (floor 350), platform 192 pass, both typechecks, connect lint, connect build ok
SMOKE: lock SQL extracted from disconnect.ts run on a throwaway local PG17 (initdb in /tmp, removed): held sibling → null; overlapping meet/drive runs → B null in 0 ms (no wait, no deadlock); quickbooks with $3 null ok
MUT: googleRevokeNeeded inverted → RED 2 (disconnect-upstream googleRevokeNeeded ×2); auth_failed dropped → RED 1; disconnectCopy flag ignored (true / false) → RED #322 each; googleSiblingConnected ignores status → RED #323; all restored, shasum identical
## Fix round 2 (delta 0C/0I/2M): disconnectCopy siblingConnected null (source page health read failed) → only "Google removes bcns's access once both …"; "keeps syncing" → "stays connected"; connect 353/0/0, typecheck+lint+build ok; null branch broken → RED #322, restored identical
## Fix round 3: Monday confirm text covers the Connect-button app (uninstall) and a pasted API token (regenerate: Developers → My access tokens, web-checked); NOTES #9 + DESIGN §5.9b echo it; connect 353/0/0, typecheck+lint+build ok
