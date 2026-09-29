// shopify-orders-probe --client <uuid> [--since <iso>]   READ-ONLY diagnostic for "worker syncs 0 Shopify orders".
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
const QUERIES: Record<string, { query: string; variables: Record<string, unknown> }> = {
  a_orders_q_null: { query: Q_ORDERS_5, variables: { after: null, q: null } },
  b_orders_q_test: { query: Q_ORDERS_5, variables: { after: null, q: 'test:true' } },
  c_orders_count: { query: '{ ordersCount { count precision } }', variables: {} },
  d_scopes: { query: '{ currentAppInstallation { accessScopes { handle } } }', variables: {} },
}

/** --since: Q_ORDERS with the worker's exact updated_at filter string, plus format variants of the same instant. */
export function filterVariants(since: string): Record<string, { query: string; variables: Record<string, unknown> }> {
  const t = new Date(since), sec = new Date(Math.floor(t.getTime() / 1000) * 1000)
  const qs: Record<string, string> = {
    e_updated_worker_format: `updated_at:>=${t.toISOString()}`,
    f_updated_ms_zeroed: `updated_at:>=${sec.toISOString()}`,
    g_updated_no_ms: `updated_at:>=${sec.toISOString().replace('.000Z', 'Z')}`,
    h_updated_quoted: `updated_at:>='${t.toISOString()}'`,
    i_created_backfill_format: `created_at:>=${t.toISOString()}`,
  }
  return Object.fromEntries(Object.entries(qs).map(([k, q]) => [k, { query: Q_ORDERS_5, variables: { after: null, q } }]))
}

/** One POST per query; returns only the whitelisted fields. Pure so the redaction is testable. */
/** `marks`: label → ISO time. (a) then reports, per mark, how many orders were created/updated before it (counts only). */
export async function probe(fetch: Fetch, shop: string, secret: string, marks: Record<string, string> = {}, since?: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [name, body] of Object.entries({ ...QUERIES, ...(since ? filterVariants(since) : {}) })) {
    if (body.variables.q) out[`${name}_q`] = body.variables.q // the filter string sent, for reading the counts
    const r = await fetch(shopifyEndpoint(shop), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': secret },
      body: JSON.stringify(body),
    })
    const b: any = await r.json().catch(() => ({}))
    const d = b?.data
    out[name] = {
      http: r.status,
      ...('after' in body.variables ? { nodes_length: d?.orders?.nodes?.length ?? null, has_next: d?.orders?.pageInfo?.hasNextPage ?? null } : {}),
      ...(name.startsWith('a_') ? { before: Object.fromEntries(Object.entries(marks).map(([k, t]) => {
        const nodes: any[] = d?.orders?.nodes ?? [], at = new Date(t)
        return [k, { updated: nodes.filter((n) => new Date(n.updatedAt) < at).length, created: nodes.filter((n) => new Date(n.createdAt) < at).length }]
      })) } : {}),
      ...(name === 'c_orders_count' ? { orders_count: d?.ordersCount ?? null } : {}),
      ...(name === 'd_scopes' ? { scopes: (d?.currentAppInstallation?.accessScopes ?? []).map((s: any) => s.handle) } : {}),
      errors: b?.errors ?? null,
      extensions: b?.extensions ?? null,
    }
  }
  return out
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { client: { type: 'string' }, since: { type: 'string' } } })
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
    // The connection's first runs: the ones that could have picked the orders up and didn't.
    const first = await sql(`select id, mode, started_at, entity_rows->'order' as order_rows from data.connector_runs
                             where client_id = $1 and source = 'shopify' order by id asc limit 12`, [values.client])
    console.log(JSON.stringify({ first_runs: first.rows }, null, 2))
    const marks: Record<string, string> = {}
    const cur = schedule.incremental_cursor?.order?.updated_at
    if (cur) marks.order_cursor = cur
    for (const r of first.rows) {
      const t = new Date(r.started_at).getTime()
      marks[`run_${r.id}_start`] = new Date(t).toISOString()
      marks[`run_${r.id}_start_minus_5m`] = new Date(t - 5 * 60_000).toISOString()
    }
    console.log(JSON.stringify(await probe(globalThis.fetch, config.shop, token.secret, marks, values.since), null, 2))
  } finally {
    await closePool()
  }
}

if (isMain(import.meta.url)) runMain(main)
