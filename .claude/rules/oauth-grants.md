---
paths:
  - "apps/connect/app/api/oauth/**"
  - "apps/connect/lib/oauth-*.ts"
  - "apps/connect/lib/shopify-oauth.ts"
  - "platform/worker/src/run.ts"
---

# OAuth grants

Audited 2026-10-24 at `ddce97c`. Only verified facts; `unknown` means neither the code nor the provider docs we could fetch say.

- **Invariant:** never exchange a code (a new grant) until the tenant is known and signed in, unless the exchange cannot invalidate a credential already stored. A new grant that is not persisted is a lost credential.
- Persist the rotated secret in the same tx as the provider call (`refreshOne`, `platform/worker/src/run.ts`: row lock `for update skip locked`, provider call and `refresh_secret` write in one `tx`). A tx cannot undo the provider call: if the write or commit fails after the provider rotated, the stored token is already spent (Intuit: the same refresh token sent twice gives `invalid_grant`, Authorization FAQ).
- Any hub `/callback` order: gate, signed state, state cookie, owner session + tenant match, then the network. Keep it. `requireOwner` redirects before the exchange; the Google callback returns `forbidden` before it.
- Shopify is the only provider with a session-less start (HMAC "Open app"). Its fix lives under `apps/connect/app/api/oauth/shopify/` and is not covered here.

## Example: Shopify 2026-10-24

- Reviewer opened the app from the shop admin with no hub session. `/callback` exchanged the code (a new grant, which retires the stored refresh token) before any sign-in.
- Sign-in was abandoned, `/finish` dropped the new token, and the 20:00 refresh failed: `auth_failed`.
- Even the owning tenant kills its own token this way. Memory: `reference-shopify-grant-kills-refresh-token`.

## Per provider (non-Shopify)

All five: `/start` is POST-only, cross-site refused, owner-only (`startPOST` `oauth-connect.ts:77`/`google-connect.ts:70`, QuickBooks `start/route.ts:21`), and `/callback` exchanges only after owner session + tenant match. So no exchange without a signed-in owner.

| Source | New grant retires prior credential? | Wrong-tenant guard | New token obtained, not persisted | Worker refresh |
|---|---|---|---|---|
| meta | unknown (docs: new long-lived token is "a different string", older ones not stated) | none (only Shopify has `shop_in_use`, `attach_source`) | `no_ad_account` after both exchanges; `write_failed`; multi-account pick abandoned (cookie expires) | none: no `refreshToken` in `connectors/meta.ts`; ~60-day token ends `auth_failed` |
| monday | unknown (docs: tokens do not expire; re-authorize not stated) | none | `no_board`; `write_failed`; pick abandoned | none (non-expiring) |
| meet, drive | no: Google keeps up to 100 refresh tokens per account per client; only past that the oldest dies | none | callback seals tokens in a cookie and writes nothing; cancel, bad folder, failed `verifyFolder`, `write_failed` drop them. Old stored token stays valid | `refreshGoogleToken` (`connectors/google.ts:39`); no rotation, `coalesce` keeps the stored refresh secret |
| quickbooks | unknown for a new grant; refresh rotates (Intuit FAQ: always store the latest) | none (`realm_id` shape only, `api.connect_source`) | `exchangeCode` then `connect_source` error: `write_failed` (`callback/route.ts:64`) | `connectors/quickbooks.ts:156`, persists the new `refresh_secret` in the `refreshOne` tx; throws if none returned |

## Worker purge paths

- `privacy.ts` shop/redact deletes Shopify rows only; it escalates unless the token is non-active and unused for 24h (`resolveGuard`). Accepted replay risk is noted there.
- `disconnect.ts` `revokeOne` revokes upstream then deletes the rows, only for `status='revoked'` + `status_detail='owner_disconnect'`. Google revoke is skipped while the sibling (meet/drive) is live. Whether revoking one Google refresh token ends tokens from other grants: unknown.
