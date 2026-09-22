# retention-30d — `shop/redact` automatic deletion: plan, not shipped

**Status:** not implemented. `customers/redact` and `customers/data_request` stay manual by
design either way (out of scope); this is only about `shop/redact`'s 48-hour deadline.

## Why this is a plan and not a diff

The smallest automatic path the `ponytail:` comment in `apps/connect/lib/shopify-webhooks.ts`
names — the webhook writes a row to `data.privacy_requests`, a worker task deletes it — needs the
webhook to write that row without a session. `apps/connect` holds only the Supabase anon key, by
design (no service-role key outside `platform/worker`/Edge Functions). Any Postgres RPC granted to
`anon` is, by construction, callable by anyone holding the public anon key (it ships in every
browser bundle), not only by our HMAC-verified route. The HMAC check that proves a request really
came from Shopify happens in `gdprRoute` (`apps/connect/lib/shopify-webhook-route.ts`) — a step
*before* the DB call. Nothing at the RPC layer can tell a real webhook from a forged one, because
the RPC never sees the signature.

**What that means concretely.** A `record_privacy_request('shop/redact', p_shop text)` RPC
grantable to `anon` would let anyone who knows (or guesses) a live merchant's `*.myshopify.com`
domain — often visible on the storefront itself — enqueue a real deletion of that merchant's
connected data, with no uninstall ever happening. The worker's whole job is to act on queued rows,
so it would carry the deletion out within 5 minutes. That is an unauthenticated data-loss vector on
a store still actively using bcns Connect. This item's own CAUTION ("treat every deletion path as
security-grade") rules it out, so the smallest path doesn't clear the bar it has to clear.

## Options considered

1. **Pass the RPC no proof, trust the Next.js layer.** Rejected above — the `anon` grant is itself
   the hole; PostgREST doesn't know the caller went through `gdprRoute`.
2. **Re-verify the Shopify HMAC inside Postgres** (pass the raw body + header through, `pgcrypto`'s
   `hmac()`, compare against the client secret). Needs `SHOPIFY_CLIENT_SECRET` available to
   Postgres — a secret-in-DB mechanism (Vault, or a superuser-set config parameter) that doesn't
   exist in this repo today. New infra, new hosted step, past this item's scope.
3. **Give `apps/connect` a service-role key just for this one insert.** Directly forbidden by this
   item's own constraints ("No service-role key outside `platform/worker` or Edge Functions").
4. **A Supabase Edge Function holding the service-role key, invoked from the webhook route**, which
   re-verifies the Shopify HMAC itself before writing `data.privacy_requests`. Closes the hole —
   only a request that passes HMAC ever reaches the queue — but it's a new deploy target this repo
   doesn't use yet (no `supabase/functions/`, no CI for it, no prior art to follow). Its own item,
   not a ~200-line addition to a retention-window change.

## Current state, unchanged by this branch

`shop/redact` is recorded (shop domain + webhook id in the operator email, never the payload) and
the operator is emailed with the 48-hour deadline. Deletion is manual: the operator deletes that
shop's rows by hand within the window — the same per-table scope `hard-delete.ts` uses
(`data.raw` partitions, `data.customers`, `data.products`, `data.money`, `records`/`jobs`/
`messages`/`daily_metrics` filtered by `source = 'shopify'`, plus the `source_tokens` row), just run
against one `source` instead of one `client_id`.

## Recommended next step

Build option 4 as its own item: an Edge Function that duplicates `verifyWebhookHmac` (already pure,
already tested) server-side, and only on a pass writes to `data.privacy_requests`; a worker task
then resolves the shop domain to a `client_id` via `data.connector_schedule.config->>'shop'`
(`source = 'shopify'`) and runs the scoped delete above. Worth scoping — and reviewing — on its own,
since it's the first Edge Function in this repo (build, deploy, secrets), not folded into a 30-day
retention-window change.
