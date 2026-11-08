// 2.1.4: api.daily_summary_v1 = Shopify "Total sales" / "Orders" in one reporting currency
// (migrations 20261107120000, 20261107140000). Needs the local stack; skips with the other DB files when it is down.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { sql } from './helpers.js'

const made: string[] = []
afterAll(async () => {
  if (!made.length) return
  await sql(`delete from data.money where client_id = any($1::uuid[])`, [made])
  await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
})

async function client() {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Total Sales Fixture', 'UTC')`, [id, `ts-${id.slice(0, 8)}`])
  return id
}
type Row = { id: string; kind: 'order' | 'refund'; day: string; amount: number; cur: string; cancelled?: boolean; parent?: string }
async function put(c: string, r: Row) {
  await sql(
    `insert into data.money (client_id, source, external_id, kind, occurred_at, day, amount_minor, currency, attributes)
     values ($1, 'shopify', $2, $3, $4::date + time '12:00', $4, $5, $6, $7::jsonb)`,
    [c, r.id, r.kind, r.day, r.amount, r.cur, JSON.stringify({ cancelled_at: r.cancelled ? '2026-11-01T00:00:00Z' : null, order_external_id: r.parent ?? null })])
}
const summary = async (c: string) =>
  (await sql(`select day::text, revenue_minor::int, orders::int, refunds_minor::int, currency from api.daily_summary_v1 where client_id = $1 order by day`, [c])).rows

describe('daily_summary_v1 = Shopify Total sales', () => {
  it('nets refunds, keeps cancelled orders (cancel with refund nets to zero, cancel without refund stays), one currency', async () => {
    const c = await client()
    await put(c, { id: 'o-old-usd', kind: 'order', day: '2026-10-20', amount: 999900, cur: 'USD' }) // store changed currency since
    await put(c, { id: 'o1', kind: 'order', day: '2026-11-03', amount: 10000, cur: 'EGP' })
    await put(c, { id: 'o2', kind: 'order', day: '2026-11-03', amount: 5000, cur: 'EGP' })
    await put(c, { id: 'o-cancelled', kind: 'order', day: '2026-11-03', amount: 7000, cur: 'EGP', cancelled: true })
    await put(c, { id: 'o-cancelled-no-refund', kind: 'order', day: '2026-11-03', amount: 2000, cur: 'EGP', cancelled: true })
    await put(c, { id: 'r-cancelled', kind: 'refund', day: '2026-11-03', amount: -7000, cur: 'EGP', parent: 'o-cancelled' })
    await put(c, { id: 'r1', kind: 'refund', day: '2026-11-04', amount: -2500, cur: 'EGP', parent: 'o1' })
    const rows = Object.fromEntries((await summary(c)).map(r => [r.day, r]))
    // 10000 + 5000 + 7000 + 2000 - 7000 (cancel refund); Shopify counts all 4 orders
    expect(rows['2026-11-03']).toMatchObject({ revenue_minor: 17000, orders: 4, refunds_minor: -7000, currency: 'EGP' })
    expect(rows['2026-11-04']).toMatchObject({ revenue_minor: -2500, orders: 0, refunds_minor: -2500 })
    expect(rows['2026-10-20']).toMatchObject({ revenue_minor: 0, orders: 0 }) // old-currency day contributes nothing
  })

  it('a store still in one currency is unchanged (gross order totals)', async () => {
    const c = await client()
    await put(c, { id: 'a', kind: 'order', day: '2026-11-01', amount: 4200, cur: 'USD' })
    await put(c, { id: 'b', kind: 'order', day: '2026-11-01', amount: 800, cur: 'USD' })
    expect((await summary(c))[0]).toMatchObject({ revenue_minor: 5000, orders: 2, currency: 'USD' })
  })

  it('matches the bcns-data-dev day: $100 + $50 cancelled+refunded + $25 with $10 refund + $20 cancelled, refund later', async () => {
    const c = await client()
    await put(c, { id: 'a', kind: 'order', day: '2026-11-07', amount: 10000, cur: 'USD' })
    await put(c, { id: 'b', kind: 'order', day: '2026-11-07', amount: 5000, cur: 'USD', cancelled: true })
    await put(c, { id: 'rb', kind: 'refund', day: '2026-11-07', amount: -5000, cur: 'USD', parent: 'b' })
    await put(c, { id: 'c', kind: 'order', day: '2026-11-07', amount: 2500, cur: 'USD' })
    await put(c, { id: 'rc', kind: 'refund', day: '2026-11-07', amount: -1000, cur: 'USD', parent: 'c' })
    await put(c, { id: 'd', kind: 'order', day: '2026-11-07', amount: 2000, cur: 'USD', cancelled: true })
    const r = (await sql(`select revenue_minor::int, orders::int, aov_minor::int from api.daily_summary_v1 where client_id = $1`, [c])).rows[0]
    expect(r).toMatchObject({ revenue_minor: 13500, orders: 4, aov_minor: 4875 }) // Shopify: Total sales $135, Orders 4, AOV $48.75
  })

  it('AOV is order totals / orders, refunds not deducted', async () => {
    const c = await client()
    await put(c, { id: 'a', kind: 'order', day: '2026-11-01', amount: 4200, cur: 'USD' })
    await put(c, { id: 'b', kind: 'order', day: '2026-11-01', amount: 800, cur: 'USD' })
    await put(c, { id: 'r', kind: 'refund', day: '2026-11-01', amount: -1000, cur: 'USD', parent: 'a' })
    const aov = (await sql(`select revenue_minor::int, aov_minor::int from api.daily_summary_v1 where client_id = $1`, [c])).rows[0]
    expect(aov).toMatchObject({ revenue_minor: 4000, aov_minor: 2500 })
  })
})
