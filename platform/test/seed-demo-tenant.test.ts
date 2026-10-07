// seed-demo-tenant: pure generators + the --apply guard. Deliberately does NOT import ./helpers,
// so it runs without the local Supabase stack (and therefore on every `pnpm test`).
import { describe, expect, it } from 'vitest'
import {
  DAYS, DEFAULT_SLUG, DEMO_NOTES, buildPlan, countsOf, genDailyMetrics, genJobs, genMessages, genOrders, genProducts,
  genRecords, main, reviewerEmail, rng, upsertSql, type Admin, type Conn,
} from '../scripts/seed-demo-tenant.js'
import { ScriptError } from '../scripts/_lib.js'

const BASE = new Date('2026-10-06T00:00:00Z')

/** Fake db: records every statement. `owner` is what data.clients.notes returns for the slug. */
function fakeDb(notes: string | null = null) {
  const calls: { sql: string; params?: unknown[] }[] = []
  let connects = 0
  const conn: Conn = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/^select id, notes from data\.clients/.test(sql)) return { rows: [{ id: 'client-1', notes: notes ?? DEMO_NOTES }], rowCount: 1 }
      if (/from auth\.users/.test(sql)) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 0 }
    },
    release() {},
  }
  const admin: Admin = {
    async createUser() { return { data: { user: { id: 'user-1' } }, error: null } },
    async updateUserById() { return { error: null } },
  }
  return { calls, admin, deps: { connect: async () => (connects++, conn), get connects() { return connects } } }
}
const writes = (calls: { sql: string }[]) => calls.filter((c) => /^\s*(insert|update|delete|begin|commit)/i.test(c.sql))

describe('generators', () => {
  it('are deterministic for a base date and shift with it', () => {
    expect(buildPlan(BASE)).toEqual(buildPlan(BASE))
    expect(buildPlan(new Date('2026-11-01T00:00:00Z')).tables.money[0]).not.toEqual(buildPlan(BASE).tables.money[0])
    const a = rng(1), b = rng(1)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('cover the views a reviewer would exercise with realistic volumes', () => {
    const c = countsOf(buildPlan(BASE))
    expect(Object.keys(c).sort()).toEqual(['customers', 'daily_metrics', 'jobs', 'messages', 'money', 'products', 'records'])
    expect(c.money).toBeGreaterThanOrEqual(150)
    expect(c.customers).toBeGreaterThanOrEqual(25)
    expect(c.products).toBe(8)
    expect(c.jobs).toBe(12)
    expect(c.messages).toBe(6)
    expect(c.records).toBeGreaterThanOrEqual(9)
    expect(c.daily_metrics).toBeGreaterThan(DAYS * 3)
  })

  it('money rows have consistent shapes: orders positive, refunds negative, links resolve', () => {
    const { orders, refunds, payouts, customers } = genOrders(BASE)
    const customerIds = new Set(customers.map((c) => c.external_id))
    for (const o of orders) {
      expect(o.kind).toBe('order')
      expect(o.amount_minor as number).toBeGreaterThan(0)
      expect(o.currency).toBe('USD')
      expect(customerIds.has(o.customer_external_id as string)).toBe(true)
      expect((o.occurred_at as string).slice(0, 10)).toBe(o.day)
    }
    expect(refunds.length).toBeGreaterThan(0)
    for (const r of refunds) expect(r.amount_minor as number).toBeLessThan(0)
    expect(payouts.length).toBeGreaterThanOrEqual(8)
    // customer totals reconcile with the orders that point at them
    for (const c of customers) {
      const mine = orders.filter((o) => o.customer_external_id === c.external_id)
      expect(c.orders_count).toBe(mine.length)
      expect(c.total_spent_minor).toBe(mine.reduce((s, o) => s + (o.amount_minor as number), 0))
    }
  })

  it('daily metrics use only known metric names and one row per natural key', () => {
    const { orders } = genOrders(BASE)
    const rows = genDailyMetrics(BASE, orders)
    const known = new Set(['sessions', 'conversion_rate', 'inventory_units', 'spend', 'impressions', 'clicks', 'reach', 'purchases', 'purchase_value'])
    for (const r of rows) expect(known.has(r.metric as string)).toBe(true)
    const keys = rows.map((r) => [r.source, r.day, r.entity_kind, r.entity_id, r.metric].join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('external ids are unique per table (the idempotent upsert key) and stable across runs', () => {
    const plan = buildPlan(BASE)
    for (const t of ['money', 'customers', 'products', 'jobs', 'messages', 'records']) {
      const keys = plan.tables[t].map((r) => `${r.source}|${r.external_id}`)
      expect(new Set(keys).size, t).toBe(keys.length)
      expect(keys).toEqual(buildPlan(BASE).tables[t].map((r) => `${r.source}|${r.external_id}`))
    }
    // a later base date moves timestamps but not keys, so a re-run updates rows rather than adding them
    const later = buildPlan(new Date('2026-12-01T00:00:00Z'))
    expect(countsOf(later)).toEqual(countsOf(plan))
  })

  it('contains nothing real-looking: example.com emails only, no phone numbers, no real hosts', () => {
    const blob = JSON.stringify(buildPlan(BASE))
    const emails = blob.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []
    expect(emails.length).toBeGreaterThan(20)
    for (const e of emails) expect(e.endsWith('@example.com')).toBe(true)
    expect(blob).not.toMatch(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/)
    for (const u of blob.match(/https?:\/\/[^"\\\s]+/g) ?? []) expect(u.startsWith('https://example.com/')).toBe(true)
    for (const c of buildPlan(BASE).tables.customers) expect(c.email).toMatch(/^[a-z.]+\d+@example\.com$/)
  })

  it('every table row only uses columns that exist on its data.* table', () => {
    const cols: Record<string, string[]> = {
      money: ['source', 'external_id', 'kind', 'occurred_at', 'day', 'amount_minor', 'currency', 'status', 'order_number', 'customer_external_id', 'items_count', 'url', 'attributes', 'source_updated_at'],
      customers: ['source', 'external_id', 'email', 'name', 'first_order_at', 'orders_count', 'total_spent_minor', 'currency', 'attributes', 'source_updated_at'],
      products: ['source', 'external_id', 'title', 'handle', 'status', 'vendor', 'product_type', 'price_minor', 'currency', 'inventory_quantity', 'variants_count', 'image_url', 'url', 'attributes', 'source_updated_at'],
      jobs: ['source', 'external_id', 'kind', 'title', 'status', 'is_done', 'priority', 'group_name', 'owner', 'due_on', 'url', 'attributes', 'source_updated_at'],
      messages: ['source', 'external_id', 'kind', 'title', 'body', 'occurred_at', 'participants', 'url', 'attributes', 'source_updated_at'],
      records: ['source', 'external_id', 'kind', 'title', 'body', 'occurred_at', 'attributes', 'source_updated_at'],
      daily_metrics: ['source', 'day', 'entity_kind', 'entity_id', 'metric', 'value', 'currency'],
    }
    const plan = buildPlan(BASE)
    for (const [t, allowed] of Object.entries(cols)) {
      for (const row of plan.tables[t]) for (const k of Object.keys(row)) expect(allowed, `${t}.${k}`).toContain(k)
    }
    expect(genProducts(BASE).length + genJobs(BASE).length + genMessages(BASE).length + genRecords(BASE).length).toBeGreaterThan(0)
  })

  it('upsertSql targets the natural key and never writes outside data.<table>', () => {
    const sql = upsertSql('money', { source: 'shopify', external_id: 'x' })
    expect(sql).toContain('on conflict (client_id, source, external_id) do update set')
    expect(sql).not.toMatch(/client_id = excluded/)
    expect(upsertSql('daily_metrics', { source: 's', day: 'd', entity_kind: 'k', entity_id: 'i', metric: 'm', value: 1 }))
      .toContain('on conflict (client_id, source, day, entity_kind, entity_id, metric)')
  })
})

describe('the --apply guard', () => {
  it('dry run (no flag) issues zero queries, opens no connection and prints the plan', async () => {
    const { calls, admin, deps } = fakeDb()
    const lines: string[] = []
    await main([], { ...deps, admin, today: BASE, log: (l) => lines.push(l) })
    expect(calls).toEqual([])
    expect(deps.connects).toBe(0)
    expect(lines.join('\n')).toContain('dry run')
    expect(lines.join('\n')).toMatch(/data\.money: \d+/)
    expect(lines.join('\n')).not.toMatch(/password/)
  })

  it('--apply writes: client, one upsert per table, settings, membership; prints the password once', async () => {
    const { calls, admin, deps } = fakeDb()
    const lines: string[] = []
    await main(['--apply'], { ...deps, admin, today: BASE, log: (l) => lines.push(l) })
    const sqls = writes(calls).map((c) => c.sql)
    expect(sqls[0]).toBe('begin')
    expect(sqls.some((s) => /insert into data\.clients/.test(s))).toBe(true)
    for (const t of ['money', 'customers', 'products', 'daily_metrics', 'jobs', 'messages', 'records']) {
      expect(sqls.some((s) => s.startsWith(`insert into data.${t} `))).toBe(true)
    }
    expect(sqls.some((s) => /insert into data\.ai_settings/.test(s))).toBe(true)
    expect(sqls).toContain('commit')
    expect(sqls.some((s) => /insert into data\.memberships/.test(s))).toBe(true)
    expect(lines.filter((l) => /reviewer password \(save now, shown once\): \S{20,}/.test(l))).toHaveLength(1)
    expect(lines.join('\n')).toContain(reviewerEmail(DEFAULT_SLUG))
    // every table payload carries the client id the insert returned
    const money = calls.find((c) => c.sql.startsWith('insert into data.money '))!
    expect(JSON.parse(money.params![0] as string)[0].client_id).toBe('client-1')
  })

  it('refuses a slug that belongs to a real client, and rolls back with nothing written', async () => {
    const { calls, admin, deps } = fakeDb('Real customer notes')
    await expect(main(['--apply', '--slug', 'acme-real'], { ...deps, admin, today: BASE, log: () => {} })).rejects.toBeInstanceOf(ScriptError)
    const sqls = calls.map((c) => c.sql)
    expect(sqls).toContain('rollback')
    expect(sqls.some((s) => s.startsWith('insert into data.money'))).toBe(false)
    expect(sqls).not.toContain('commit')
  })

  it('rejects a bad slug or base date before doing anything', async () => {
    const { calls, deps } = fakeDb()
    await expect(main(['--apply', '--slug', 'Bad Slug'], deps)).rejects.toBeInstanceOf(ScriptError)
    await expect(main(['--apply', '--base-date', 'yesterday'], deps)).rejects.toBeInstanceOf(ScriptError)
    expect(calls).toEqual([])
    expect(deps.connects).toBe(0)
  })
})
