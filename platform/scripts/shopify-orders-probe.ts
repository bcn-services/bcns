// shopify-orders-probe --client <uuid>   READ-ONLY diagnostic for "worker syncs 0 Shopify orders".
// Loads the stored token the way run.ts does, then asks the Admin API four things with it:
//   a. the worker's own Q_ORDERS, q=null          b. Q_ORDERS, q="test:true"
//   c. ordersCount                                d. the token's granted scope handles
// Prints only statuses, counts, errors, extensions and scope handles — never the token, never an
// order or customer field. Never refreshes: a refresh rotates the refresh token, which is a write.
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
export async function probe(fetch: Fetch, shop: string, secret: string): Promise<Record<string, unknown>> {
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
    const s = await sql(`select config from data.connector_schedule where client_id = $1 and source = 'shopify'`, [values.client])
    if (!s.rows[0]) die('no shopify connector_schedule row for that client')
    const config = connectors.shopify.configSchema.parse(s.rows[0].config)
    const minsLeft = token.expires_at ? Math.round((new Date(token.expires_at).getTime() - Date.now()) / 60_000) : null
    console.log(JSON.stringify({ shop: config.shop, token_kind: token.kind, token_expires_in_min: minsLeft }))
    if (minsLeft !== null && minsLeft <= 0) die('stored token is expired; wait for the next worker tick to refresh it, then re-run')
    console.log(JSON.stringify(await probe(globalThis.fetch, config.shop, token.secret), null, 2))
  } finally {
    await closePool()
  }
}

if (isMain(import.meta.url)) runMain(main)
