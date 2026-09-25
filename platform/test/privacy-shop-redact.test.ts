// shopify-shop-redact worker task (platform/worker/src/privacy.ts, docs/architecture/
// retention-30d-shop-redact.md): claims pending data.privacy_requests rows, resolves shop ->
// client via connector_schedule, and either deletes that client's shopify-sourced rows or
// escalates to needs_operator via data.notifications. Every fixture client/shop here is
// synthetic (own uuid, own random shop domain) so this file never touches the shared acme/
// beta/gamma seed that other test files depend on.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { sql } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { shopRedact } from '../worker/src/privacy.js'

const made: string[] = []
const requestIds: number[] = []

function mkTick(): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch: globalThis.fetch,
    stubbed: true, now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 24,
  }
}

function shopFor(id: string): string {
  return `pv-${id.slice(0, 8)}.myshopify.com`
}

async function mkClient(shop: string, opts: { config?: Record<string, unknown>; tokenAt?: Date } = {}): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Privacy Fixture', 'America/New_York')`, [id, `pv-${id.slice(0, 8)}`])
  await sql(
    `insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
     values ($1, 'shopify', '1 hour', current_date - 7, $2::jsonb, now() + interval '1 day')`,
    [id, JSON.stringify({ shop, ...opts.config })]
  )
  const tokenAt = opts.tokenAt ?? new Date()
  await sql(
    `insert into data.source_tokens (client_id, source, kind, secret, created_at, updated_at)
     values ($1, 'shopify', 'shopify_admin', 'test-token', $2, $2)`,
    [id, tokenAt]
  )
  await sql(
    `insert into data.customers (client_id, source, external_id, email, name) values ($1, 'shopify', 'c1', 'x@example.com', 'X')`,
    [id]
  )
  await sql(
    `insert into data.customers (client_id, source, external_id, email, name) values ($1, 'monday', 'm1', 'y@example.com', 'Y')`,
    [id]
  )
  return id
}

async function queueRequest(shop: string, receivedAt: Date = new Date()): Promise<number> {
  const r = await sql<{ id: number }>(
    `insert into data.privacy_requests (topic, shop, webhook_id, received_at) values ('shop/redact', $1, $2, $3) returning id`,
    [shop, `wh-${randomUUID()}`, receivedAt]
  )
  requestIds.push(r.rows[0].id)
  return r.rows[0].id
}

async function statusOf(id: number): Promise<{ status: string; error: string | null }> {
  const r = await sql<{ status: string; error: string | null }>(`select status, error from data.privacy_requests where id = $1`, [id])
  return r.rows[0]
}

async function customerCount(clientId: string, source: string): Promise<number> {
  const r = await sql<{ n: string }>(`select count(*) n from data.customers where client_id = $1 and source = $2`, [clientId, source])
  return Number(r.rows[0].n)
}

afterAll(async () => {
  if (made.length) {
    for (const t of ['customers', 'connector_schedule', 'source_tokens']) {
      await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
    }
    await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  }
  if (requestIds.length) await sql(`delete from data.privacy_requests where id = any($1::bigint[])`, [requestIds])
  await sql(`delete from data.notifications where kind = 'shop_redact_needs_operator'`)
  await closePool()
})

describe('shopRedact', () => {
  it('deletes only the matching client shopify rows and marks the row done', async () => {
    const shop = shopFor(randomUUID())
    const client = await mkClient(shop)
    const other = await mkClient(shopFor(randomUUID()))
    const id = await queueRequest(shop)

    const n = await shopRedact(mkTick())
    expect(n).toBe(1)

    expect(await statusOf(id)).toMatchObject({ status: 'done' })
    expect(await customerCount(client, 'shopify')).toBe(0)
    expect(await customerCount(client, 'monday')).toBe(1) // non-shopify rows untouched
    expect(await customerCount(other, 'shopify')).toBe(1) // other client untouched
  })

  it('escalates an unknown shop: needs_operator, nothing deleted', async () => {
    const shop = shopFor(randomUUID())
    const id = await queueRequest(shop)

    const n = await shopRedact(mkTick())
    expect(n).toBe(1) // "processed" = handled, not necessarily deleted

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/no client matches/)
    const notif = await sql(`select payload from data.notifications where dedupe_key = $1`, [`shop_redact_needs_operator:${id}`])
    expect(notif.rowCount).toBe(1)
  })

  it('escalates an ambiguous shop (two clients share it): needs_operator, nothing deleted', async () => {
    const shop = shopFor(randomUUID())
    const a = await mkClient(shop)
    const b = await mkClient(shop)
    const id = await queueRequest(shop)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/2 clients match/)
    expect(await customerCount(a, 'shopify')).toBe(1)
    expect(await customerCount(b, 'shopify')).toBe(1)
  })

  it('escalates the sb-bridge shop by domain, even with no matching client: needs_operator', async () => {
    const id = await queueRequest('fa8a00-11.myshopify.com')
    await shopRedact(mkTick())
    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/sb-bridge/)
  })

  it('escalates a client carrying the sb-bridge config marker: needs_operator, nothing deleted', async () => {
    const shop = shopFor(randomUUID())
    const client = await mkClient(shop, { config: { app: 'bcns-data' } })
    const id = await queueRequest(shop)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/sb-bridge config marker/)
    expect(await customerCount(client, 'shopify')).toBe(1)
  })

  it('escalates a shop that reconnected after the request was received: needs_operator, nothing deleted', async () => {
    const shop = shopFor(randomUUID())
    const receivedAt = new Date(Date.now() - 60_000)
    const client = await mkClient(shop, { tokenAt: new Date() }) // token newer than receivedAt below
    const id = await queueRequest(shop, receivedAt)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/reconnected/)
    expect(await customerCount(client, 'shopify')).toBe(1)
  })

  it('is idempotent: a row already done or needs_operator is left alone on a second run', async () => {
    const shop = shopFor(randomUUID())
    await mkClient(shop)
    const id = await queueRequest(shop)

    await shopRedact(mkTick())
    expect((await statusOf(id)).status).toBe('done')

    const n = await shopRedact(mkTick())
    expect(n).toBe(0) // nothing pending left to claim
    expect((await statusOf(id)).status).toBe('done')
  })
})
