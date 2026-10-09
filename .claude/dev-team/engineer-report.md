# Engineer Report
**Task:** Item C, stale docs + legal copy (items 7, 10)
**Branch:** polish/docs
**Date:** 2026-10-08

## Design Decisions
- platform-v1.md: two "Actions minutes exhausted until 2026-10-01" lines deleted outright; sign-up line corrected to one true clause (flag-gated, `apps/connect/app/login/page.tsx:105-109`, `apps/connect/lib/env.ts:69-74,119`, `platform/supabase/functions/signup`).
- platform/DESIGN.md dropped: `pending` exists only as clients status (`20261001000100`, `20261007000100`) and `data.privacy_requests` (`20260924000300:22`, `platform/worker/src/privacy.ts`); no connector_health / notifications `pending`. Not touched.
- Privacy sentence placed in "Requesting deletion" (applies to 4 sources, not only QuickBooks); `legal.privacy.effectiveDate` bumped to October 8, 2026 (copy changed).

## Files Changed
- `docs/architecture/platform-v1.md` - 2 deletions (:70, :316), :214 sign-up claim corrected.
- `apps/web/lib/content.ts` - maintainer comment (~:996) now says the sentence is shipped; one sentence added to legal.privacy "Requesting deletion"; privacy effectiveDate bump.
- `apps/web/CONTENT.md` - :1090 and :1092 no longer say "when the hub disconnect ships"; no field added, so the field count is untouched (CONTENT.md does not mirror body text).

## Disconnect behaviour sources (read)
- `apps/connect/lib/sources.ts:225` DISCONNECTABLE = quickbooks, meet, drive, monday, meta (never Shopify).
- `apps/connect/app/api/sources/[source]/disconnect/route.ts:1-8,27-33` owner-only; rpc `disconnect_source` marks token revoked; worker revokes upstream then deletes.
- `platform/worker/src/disconnect.ts:36-90` revoke: Intuit, Google, Meta; monday returns 'none'. `:93-104,142` Google skipped while the sibling Google source (meet/drive) is live. `:156-157` deletes raw data, token, schedule, health, media.

## Sentence added
"You can also disconnect QuickBooks Online, Meta Ads, monday.com, Google Drive or meeting notes yourself in the hub; we then delete the token and data we stored for that source and revoke our access with Intuit, Meta or Google (Google once Drive and meeting notes are both disconnected; monday.com has nothing to revoke)."

## Deferred / Out of Scope
- DESIGN.md pending item (dropped, see above).

## Flags for Reviewer
- Sentence says "delete" without a time; worker deletes on its next housekeeping tick, and a stuck upstream revoke retries (`disconnect.ts:162`). Backups still roll off per the existing 7-day line.
- Sentence is long; shorten by dropping the Google parenthetical if the nuance is not wanted.
