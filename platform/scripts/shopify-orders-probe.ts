// shopify-orders-probe --client <uuid>   READ-ONLY diagnostic for "worker syncs 0 Shopify orders".
// Loads the stored token the way run.ts does, then asks the Admin API four things with it:
//   a. the worker's own Q_ORDERS, q=null          b. Q_ORDERS, q="test:true"
//   c. ordersCount                                d. the token's granted scope handles
// Also prints the worker's DB state for that client (cursors, recent runs, token timestamps, synced
// counts). Prints only statuses, counts, timestamps, errors, extensions and scope handles — never the
// token, never an order or customer field. Never refreshes: a refresh rotates the refresh token, which is a write.
// Nate-run against hosted: `DATABASE_URL=<session pooler> corepack pnpm tsx scripts/shopify-orders-probe.ts --client <uuid>`
import { parseArgs } from 'node:util'
// connectors/index.js must load before shopify.js (see qa-checklist-s1.test.ts); run.js pulls it in.
import { loadToken } from '../worker/src/run.js'
import { connectors } from '../worker/src/connectors/index.js'
import { Q_ORDERS } from '../worker/src/connectors/shopify.js'
import { shopifyEndpoint } from '../worker/src/connectors/shopify-url.js'
import { closePool, sql } from '../worker/src/db.js'
import { die, isMain, runMain } from './_lib.js'

type Fetch = typeof globalThis.fetch
const Q_ORDERS_5 = Q_ORDERS.replace(/orders\(first:\d+/, 'orders(first:5')
const QUERIES = {
  a_orders_q_null: { query: Q_ORDERS_5, variables: { after: null, q: null } },
  b_orders_q_test: { query: Q_ORDERS_5, variables: { after: null, q: 'test:true' } },
  c_orders_count: { query: '{ ordersCount { count precision } }', variables: {} },
  d_scopes: { query: '{ currentAppInstallation { accessScopes { handle } } }', variables: {} },
}

/** One POST per query; returns only the whitelisted fields. Pure so the redaction is testable. */
/** `orderCursor`: the stored incremental cursor; (a) then counts orders the worker's updated_at:>= filter would skip. */
export async function probe(fetch: Fetch, shop: string, secret: string, orderCursor: string | null = null): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [name, body] of Object.entries(QUERIES)) {
    const r = await fetch(shopifyEndpoint(shop), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': secret },
      body: JSON.stringify(body),
    })
    const b: any = await r.json().catch(() => ({}))
    const d = b?.data
    out[name] = {
      http: r.status,
      ...(name.startsWith('a_') || name.startsWith('b_') ? { nodes_length: d?.orders?.nodes?.length ?? null, has_next: d?.orders?.pageInfo?.hasNextPage ?? null } : {}),
      ...(name.startsWith('a_') && orderCursor ? { updated_before_order_cursor: (d?.orders?.nodes ?? []).filter((n: any) => new Date(n.updatedAt) < new Date(orderCursor)).length } : {}),
      ...(name === 'c_orders_count' ? { orders_count: d?.ordersCount ?? null } : {}),
      ...(name === 'd_scopes' ? { scopes: (d?.currentAppInstallation?.accessScopes ?? []).map((s: any) => s.handle) } : {}),
      errors: b?.errors ?? null,
      extensions: b?.extensions ?? null,
    }
  }
  return out
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { client: { type: 'string' } } })
  if (!values.client) die('usage: shopify-orders-probe --client <uuid>')
  try {
    const token = await loadToken(values.client, 'shopify')
    const s = await sql(`select config, enabled, interval::text, backfill_from, backfill_cursor, incremental_cursor,
                                next_run_at, last_run_at, last_success_at, last_error, consecutive_failures
                         from data.connector_schedule where client_id = $1 and source = 'shopify'`, [values.client])
    if (!s.rows[0]) die('no shopify connector_schedule row for that client')
    const { config: rawConfig, ...schedule } = s.rows[0]
    const config = connectors.shopify.configSchema.parse(rawConfig)
    const minsLeft = token.expires_at ? Math.round((new Date(token.expires_at).getTime() - Date.now()) / 60_000) : null
    const tok = await sql(`select status, created_at, updated_at, last_refreshed_at from data.source_tokens where client_id = $1 and source = 'shopify'`, [values.client])
    const runs = await sql(`select id, mode, status, started_at, finished_at, pages, entity_rows, error from data.connector_runs
                            where client_id = $1 and source = 'shopify' order by id desc limit 8`, [values.client])
    const synced = await sql(`select (select count(*) from data.money where client_id = $1 and source = 'shopify' and kind = 'order') as money_orders,
                                     (select count(*) from data.raw_latest where client_id = $1 and source = 'shopify' and entity = 'order') as raw_orders`, [values.client])
    console.log(JSON.stringify({ shop: config.shop, token_kind: token.kind, token_expires_in_min: minsLeft, token: tok.rows[0], schedule, synced: synced.rows[0], runs: runs.rows }, null, 2))
    if (minsLeft !== null && minsLeft <= 0) die('stored token is expired; wait for the next worker tick to refresh it, then re-run')
    const orderCursor = schedule.incremental_cursor?.order?.updated_at ?? null
    console.log(JSON.stringify(await probe(globalThis.fetch, config.shop, token.secret, orderCursor), null, 2))
  } finally {
    await closePool()
  }
}

if (isMain(import.meta.url)) runMain(main)
