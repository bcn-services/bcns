# @bcn-services/data-client

Thin typed wrapper over `@supabase/supabase-js` for the bcns-data shared platform (DESIGN.md §8).
Talks to schema `api` only — nothing else.

## Install

Workspace-internal package (`pnpm-workspace.yaml`). Peer dependency: `@supabase/supabase-js`.

## Usage

```ts
import { createDataClient } from '@bcn-services/data-client'

const dc = createDataClient({
  supabaseUrl: 'https://<project>.supabase.co',
  anonKey: '<anon-key>',
  accessToken: session.access_token, // from the dashboard's own auth flow
})
```

### `views.<name>_v1()`

Returns a postgrest-js query builder (chain `.eq()`, `.order()`, `.limit()`, …) for every
`api.*_v1` view: `client_v1`, `money_v1`, `daily_metrics_v1`, `daily_summary_v1`,
`campaign_daily_v1`, `creative_daily_v1`, `products_v1`, `customers_v1`, `jobs_v1`,
`messages_v1`, `records_v1`, `media_v1`, `media_sets_v1`, `media_set_items_v1`, `activity_v1`,
`connector_health_v1`, `egress_status_v1`, `memberships_v1`.

```ts
const { data } = await dc.views.money_v1().eq('kind', 'order').order('day', { ascending: false })
```

### `rpc.<name>()`

One wrapper per `api.*` RPC (`save_record`, `delete_record`, `register_upload`, `update_media`,
`bulk_tag`, `delete_media`, `restore_media`, `create_media_set`, `update_media_set`,
`delete_media_set`, `set_media_set_items`, `download_url`, `report_dashboard_version`,
`remove_member`). Typed args/return from the generated `Database` type; throws `DataClientError`
on failure.

```ts
const id = await dc.rpc.save_record({ kind: 'note', attributes: { text: 'hi' } })
```

### `media`

- `media.upload(file, { title, tags })` — uploads to `<client_id>/orig/<uuid>.<ext>`, then calls
  `register_upload`. Returns the media id.
- `media.downloadUrl(mediaId)` — calls `download_url` (charges egress, mints a 5-min ticket) then
  `createSignedUrl(path, 300)`. Returns the signed URL.
- `media.thumbUrls(paths[])` — `createSignedUrls` in batches of 100, never ticketed. Returns
  `{ [path]: signedUrl | null }`.

### `health()`

Reads `client_v1` (one row). Throws `DataClientError` (`no_tenant`) if there's no active tenant.

## Errors

RPC and `health()` failures throw `DataClientError`, mapping the RPC's Postgres SQLSTATE:

| SQLSTATE | `.code` |
|---|---|
| `BCNS0` | `no_tenant` |
| `BCNS1` | `budget_reached` |
| `BCNS2` | `forbidden_role` |
| `BCNS3` | `validation` |
| `BCNS4` | `not_found` |
| `BCNS5` | `too_large` |

`.message`, `.details`, `.hint` mirror the underlying Postgres error. `.sqlstate` carries the raw
`BCNS*` code.

## Regenerating types

`src/database.types.ts` is generated, not hand-written: `pnpm db:types` (root script) against the
local stack's `api` schema.
