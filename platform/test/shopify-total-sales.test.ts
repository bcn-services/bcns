// 2.1.4: Shopify normalize must match what native Shopify Analytics counts: no test orders.
// The view half is shopify-total-sales.db.test.ts.
import { describe, expect, it } from 'vitest'
import { connectors, type RawRow, type RunContext } from '../worker/src/connectors/index.js'
import { Q_ORDERS } from '../worker/src/connectors/shopify.js'

const order = (id: string, extra: Record<string, unknown> = {}): RawRow => ({
  entity: 'order', externalId: id,
  payload: {
    id, name: `#${id.slice(-4)}`, test: false, createdAt: '2026-11-04T18:30:00Z', processedAt: '2026-11-04T18:30:00Z',
    updatedAt: '2026-11-04T18:30:00Z', cancelledAt: null, currencyCode: 'EGP',
    totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'EGP' } },
    currentTotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'EGP' } },
    lineItems: { nodes: [] }, refunds: [], ...extra,
  },
})
const norm = (config: Record<string, unknown>, rows: RawRow[]) =>
  connectors.shopify.normalize({ config, timezone: 'America/Los_Angeles', clientId: 'c', source: 'shopify' } as unknown as RunContext, rows)

describe('shopify normalize matches Shopify Analytics', () => {
  it('fetches the test flag', () => { expect(Q_ORDERS).toContain(' test ') })
  it('drops test orders, keeps real ones', () => {
    const w = norm({ shop: 'x.myshopify.com' }, [order('gid://shopify/Order/1111'), order('gid://shopify/Order/2222', { test: true })])
    expect(w.money!.map(m => m.externalId)).toEqual(['gid://shopify/Order/1111'])
  })
})
