REVIEW: 0C/3I/3M
# Review Report
**Date:** 2026-10-08
**Files Reviewed:** 3 (apps/web/lib/content.ts, apps/web/CONTENT.md, docs/architecture/platform-v1.md)

## Findings

### Important
Important — apps/web/lib/content.ts:1088 — the new sentence says "monday.com has nothing to revoke", but bcns's monday grant stays live at monday: the worker returns 'none' without any upstream call (platform/worker/src/disconnect.ts:45-46), and the hub's own confirm text tells the owner to uninstall bcns or regenerate the token in monday (apps/connect/lib/sources.ts:274-277). A reader takes it to mean no access is left. — Fix: "(monday.com gives us no way to revoke, so remove bcns in monday as well)".
Important — apps/web/lib/content.ts:1088 — "You can also disconnect ... yourself in the hub" is true only for owners. The RPC raises BCNS2 for anyone else (platform/supabase/migrations/20261007000500_source_disconnect.sql:19-21), the route needs ownerSession ("app/api/sources/[source]/disconnect/route.ts":31-32), and the button is gated on role === "owner" (lib/sources.ts canDisconnect). A team member reads that they can disconnect and finds no button. — Fix: "Your account owner can also disconnect ...".
Important — apps/web/lib/content.ts:1091 — "These requests are handled by a person, not automatically; we'll confirm with you once each one is complete" now follows the new self-serve sentence, so it also covers hub disconnects. Those are automatic (a worker tick, platform/worker/src/tick.ts:88) and no one confirms them. — Fix: move the disconnect sentence below :1091, or change :1091 to "Email requests are handled by a person ...".

### Minor
Minor — apps/web/lib/content.ts:1088 — "(Google once Drive and meeting notes are both disconnected)" fails when meet and drive were added with two different Google accounts (add-source accepts operator-entered tokens per source). If Drive (account B) is disconnected while Meet (account A) is live, the worker deletes Drive's token with outcome kept_for_sibling and never revokes it (disconnect.ts:96-101,135-147). A later Meet disconnect revokes only account A, so B's grant is never revoked. The hub's GOOGLE_BOTH copy (lib/sources.ts:263) has the same gap, and the code issue predates this diff. Data deletion itself is correct: raw and canonical rows and files are deleted for Drive even while Meet stays (disconnect.ts:149-157); only the revoke waits. — Fix: accept the edge case, or add "for the same Google account".
Minor — apps/web/lib/content.ts:996-997 — the old comment's "It deliberately" was left in place, so the comment now reads "...read/write Intuit scope. It deliberately The owner-disconnect sentence ...", which is broken. — Fix: delete the words "It deliberately".
Minor — docs/architecture/platform-v1.md:212-213 — "A stranger ... reaches only `/login`" is false when SIGNUP_ENABLED is on: `/signup` is public then (apps/connect/app/signup/page.tsx:16). "Create account" goes to the hub's `/signup` page, whose server action calls the Edge Function (signup/actions.ts:15-22), not to the Edge Function directly. — Fix: "reaches only `/login` (and `/signup` when `SIGNUP_ENABLED` is on; the page's action calls the `signup` Edge Function) ...".

## Verified true (no finding)
- DISCONNECTABLE = quickbooks, meet, drive, monday, meta, never Shopify (lib/sources.ts:225). The worker's DISCONNECT_SOURCES (disconnect.ts:14) and the RPC allow-list (20261007000500:22) match. The prod api.disconnect_source includes 'meta' (read-only SELECT, cnsxbglhredokjbvudfd), so the migration is live.
- Revoke goes to Intuit, Google and Meta (disconnect.ts:47-89). It deletes raw, token, schedule, health, media and the canonical tables (scope.ts:13-29, disconnect.ts:156-157), and files after commit. A failed revoke keeps the row and retries, with an alert after 24h (disconnect.ts:162-188).
- effectiveDate Oct 6 → Oct 8 is correct: CONTENT.md:1073 says to update it on any material change to sections. The terms date is unchanged.
- CONTENT.md:1090/:1092 mirror the change. No field was added, and "six comments" still holds.
- Both "Actions minutes exhausted until 2026-10-01" lines are gone. A repo-wide grep finds no other present-tense echo of "no sign-up route" or "exhausted until".
- The DESIGN.md drop is correct: the only `pending` values are client_status and privacy_requests.status, with none in connector_health or notifications.
- Only the 3 allowed files changed under apps/docs/platform. DESIGN.md is untouched.

## STANDARDS.md Updates
none (adding to STANDARDS.md would add a file outside the item's four allowed files)
