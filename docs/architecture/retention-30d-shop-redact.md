# retention-30d — `shop/redact` automatic deletion: shipped

**Status:** implemented (branch `shop-redact-auto`), option 4 below. `customers/redact` and
`customers/data_request` stay manual by design either way (out of scope); this was only ever
about `shop/redact`'s 48-hour deadline.

## Why a plan came first

The smallest automatic path — the webhook writes a row to `data.privacy_requests`, a worker task
deletes it — needs the webhook to write that row without a session. `apps/connect` holds only the
Supabase anon key by design (no service-role key outside `platform/worker`/Edge Functions), and no
RPC grantable to `anon` can distinguish a real HMAC-verified webhook from a forged one, because the
RPC never sees the signature. See the options considered below; option 4 is the one built.

## Options considered

1. **Pass the RPC no proof, trust the Next.js layer.** Rejected — the `anon` grant is itself the
   hole; PostgREST doesn't know the caller went through `gdprRoute`.
2. **Re-verify the Shopify HMAC inside Postgres** (`pgcrypto`'s `hmac()`). Needs
   `SHOPIFY_CLIENT_SECRET` available to Postgres — no secret-in-DB mechanism exists in this repo.
3. **Give `apps/connect` a service-role key just for this one insert.** Directly forbidden by this
   item's own constraints.
4. **A Supabase Edge Function holding the service-role key, invoked from the webhook route, which
   re-verifies the Shopify HMAC itself before writing `data.privacy_requests`.** Built. Closes the
   hole — only a request that independently passes HMAC ever reaches the queue.

## What's built

- **Hub** (`apps/connect/lib/shopify-webhook-route.ts`, `gdprRoute`): after its own HMAC check
  passes, `shop/redact` (only) is forwarded — raw body plus the same three Shopify headers — to
  `SHOP_REDACT_FUNCTION_URL`. Any forward failure (unset URL, network error, timeout, non-2xx)
  falls back to the pre-existing operator email exactly as before. `customers/redact` and
  `customers/data_request` never forward.
- **Edge Function** (`platform/supabase/functions/shopify-shop-redact/`): pure-handler
  (`handler.ts`) + injected deps (`deps.ts`), Deno entry (`index.ts`). Re-verifies the HMAC itself
  via `_shared/shopify-hmac.ts` (WebCrypto, so it needs no Deno mock under vitest/Node — see
  `platform/test/edge-shopify-shop-redact.test.ts`'s parity test against
  `apps/connect/lib/shopify-oauth.ts`'s `verifyWebhookHmac`). Binds the shop from the **signed**
  body only, never the unsigned `X-Shopify-Shop-Domain` header. Writes through
  `api.record_shop_redact` — idempotent via `data.privacy_requests.webhook_id`'s unique
  constraint (`on conflict do nothing`), so a replay queues nothing new.
- **Migration** (`platform/supabase/migrations/20260924000300_shop_redact.sql`):
  `data.privacy_requests` (RLS enabled + forced, no policies — only the pooled worker role and
  the one RPC touch it) and `api.record_shop_redact`, a `SECURITY DEFINER` function with
  `search_path = ''`, `EXECUTE` revoked from everyone then granted to `service_role` alone, plus
  the `usage on schema api` grant that's a prerequisite for `service_role` to reach it at all
  (`service_role` otherwise has zero `data`/`api` access, by design).
- **Worker task** (`platform/worker/src/privacy.ts`, wired into `tick.ts`'s housekeeping list
  before `alerts`): claims pending rows (`for update skip locked`), resolves shop → client via
  `data.connector_schedule` (`source = 'shopify'`, `config->>'shop'`), and refuses/escalates to
  `needs_operator` (a `data.notifications` row, delivered by the existing `alerts()` →
  `sendPending()` Resend path — no second mailer) on: the sb-bridge shop by domain
  (`fa8a00-11.myshopify.com`), the sb-bridge config marker (`config->>'app' = 'bcns-data'`), an
  ambiguous match (0 or >1 clients), or a shopify token not confirmed dead (still `active`, or created/refreshed/expiring within 24 h of the request — a reconnect after uninstall). Otherwise deletes that client's `source = 'shopify'` rows
  (`worker/src/scope.ts`'s `deleteClientRows`, shared with `hard-delete.ts`) in one transaction and
  marks the row `done`.
- **Logging**: shop + webhook id (implicitly, the row id) + outcome only, at every layer — no
  payload, HMAC, or secret is ever logged (see the Edge Function's own log call and
  `edge-shopify-shop-redact.test.ts`'s log-content assertion).

## Manual fallback, unchanged

If the forward fails for any reason, the pre-existing manual path still runs: the operator is
emailed (shop domain + webhook id, never the payload) with the 48-hour deadline, and deletes that
shop's rows by hand using the same per-table scope the worker now automates.
