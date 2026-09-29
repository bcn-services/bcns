// Shopify orders: the read-only probe never leaks the token or order/customer fields, and drive()
// keeps a 5-minute overlap on the cursor even when an entity comes back empty.
import { describe, expect, it } from 'vitest'
import '../worker/src/connectors/index.js' // connectors registry first; see qa-checklist-s1.test.ts
import { shopify } from '../worker/src/connectors/shopify.js'
import { probe } from '../scripts/shopify-orders-probe.js'

const empty = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] }

describe('shopify-orders-probe', () => {
  it('reports counts, errors, extensions and scopes, and nothing from the token or an order', async () => {
    const order = { id: 'gid://shopify/Order/1', name: '#1001', customer: { id: 'c1', email: 'buyer@example.com', displayName: 'Pat Buyer' } }
    const ext = { cost: { requestedQueryCost: 7, throttleStatus: { currentlyAvailable: 1993 } } }
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body))
      const data = b.query.includes('ordersCount') ? { ordersCount: { count: 3, precision: 'EXACT' } }
        : b.query.includes('accessScopes') ? { currentAppInstallation: { accessScopes: [{ handle: 'read_orders' }] } }
        : { orders: { pageInfo: { hasNextPage: false, endCursor: 'x' }, nodes: b.variables.q === 'test:true' ? [order, order, order] : [] } }
      return new Response(JSON.stringify({ data, extensions: ext }))
    }) as unknown as typeof globalThis.fetch

    const out: any = await probe(fetch, 'zz', 'shpua_secret123')
    const text = JSON.stringify(out)

    expect(out.a_orders_q_null.nodes_length).toBe(0)
    expect(out.b_orders_q_test.nodes_length).toBe(3)
    expect(out.c_orders_count.orders_count).toEqual({ count: 3, precision: 'EXACT' })
    expect(out.d_scopes.scopes).toEqual(['read_orders'])
    expect(out.a_orders_q_null.extensions).toEqual(ext)
    expect(out.b_orders_q_test.before).toBeUndefined()
    for (const leak of ['shpua_secret123', 'buyer@example.com', 'Pat Buyer', '#1001', 'Order/1']) expect(text).not.toContain(leak)
  })
})

describe('shopify drive() cursor', () => {
  it('an empty entity page still leaves the cursor 5 minutes behind now', async () => {
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      const q = String(init?.body)
      const data = q.includes('shop{') ? { shop: { currencyCode: 'USD', ianaTimezone: 'UTC' } }
        : { orders: empty, products: empty, shopifyPaymentsAccount: { payouts: empty } }
      return new Response(JSON.stringify({ data }))
    }) as unknown as typeof globalThis.fetch
    const ctx = { config: { shop: 'zz', currency: 'USD', store_timezone: 'UTC', sessions_mode: 'none' }, timezone: 'UTC',
      token: { secret: 't' }, fetch, mergeConfig: async () => {}, hasMetricToday: async () => true } as any

    const before = Date.now()
    let cursor: any
    for await (const p of shopify.incremental(ctx, {})) if (p.entity === 'order' && p.entityDone) cursor = p.cursor
    const after = Date.now()

    const at = new Date(cursor.updated_at).getTime()
    expect(at).toBeGreaterThanOrEqual(before - 5 * 60_000)
    expect(at).toBeLessThanOrEqual(after - 5 * 60_000)
  })
})

describe('shopify order search filter', () => {
  // Shopify splits an unquoted ISO time at its colons and matches nothing; it reports that only in
  // extensions.search warnings on a 200 (probe against bcns-data-dev, 2026-09-28).
  const run = async (gen: (ctx: any) => AsyncIterable<any>, warn = false) => {
    const qs: Record<string, string | null> = {}
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body))
      const entity = b.query.includes('orders(') ? 'order' : b.query.includes('products(') ? 'product' : null
      if (entity) qs[entity] = b.variables.q
      const data = b.query.includes('shop{') ? { shop: { currencyCode: 'USD', ianaTimezone: 'UTC' } }
        : { orders: empty, products: empty, shopifyPaymentsAccount: { payouts: empty } }
      const extensions = warn && entity === 'order' ? { search: [{ path: ['orders'], query: b.variables.q, warnings: [{ field: '45', message: 'Invalid search field for this query.', code: 'invalid_field' }] }] } : {}
      return new Response(JSON.stringify({ data, extensions }))
    }) as unknown as typeof globalThis.fetch
    const ctx = { config: { shop: 'zz', currency: 'USD', store_timezone: 'UTC', sessions_mode: 'none' }, timezone: 'UTC',
      token: { secret: 't' }, fetch, mergeConfig: async () => {}, hasMetricToday: async () => true } as any
    for await (const _ of gen(ctx)) { /* drain */ }
    return qs
  }
  const at = '2026-09-25T02:45:22.433Z'

  it('quotes the incremental updated_at and backfill created_at times', async () => {
    const inc = await run((ctx) => shopify.incremental(ctx, { order: { updated_at: at }, product: { updated_at: at } }))
    expect(inc.order).toBe(`updated_at:>='${at}'`)
    expect(inc.product).toBe(`updated_at:>='${at}'`)
    const back = await run((ctx) => shopify.backfill(ctx, new Date(at), null))
    expect(back.order).toBe(`created_at:>='${at}'`)
  })

  it('fails the run when Shopify reports a search warning instead of syncing an empty page', async () => {
    await expect(run((ctx) => shopify.incremental(ctx, { order: { updated_at: at } }), true)).rejects.toThrow(/invalid_field: field 45/)
  })
})
