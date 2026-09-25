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
const HOUR = 3_600_000

function mkTick(): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch: globalThis.fetch,
    stubbed: true, now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 24,
  }
}

function shopFor(id: string): string {
  return `pv-${id.slice(0, 8)}.myshopify.com`
}

interface MkClientOpts {
  config?: Record<string, unknown>
  /** Omit entirely: no data.source_tokens row at all ("token absent"). */
  noToken?: boolean
  status?: 'active' | 'auth_failed'
  createdAt?: Date
  lastRefreshedAt?: Date | null
  expiresAt?: Date | null
}

/**
 * Default token shape is "genuinely dead" (auth_failed, everything ~48h old) — the shape most
 * tests want, since it's the one the new guard actually lets through to deletion. Tests that need
 * to exercise the escalate path override status/dates explicitly.
 */
async function mkClient(shop: string, opts: MkClientOpts = {}): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Privacy Fixture', 'America/New_York')`, [id, `pv-${id.slice(0, 8)}`])
  await sql(
    `insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
     values ($1, 'shopify', '1 hour', current_date - 7, $2::jsonb, now() + interval '1 day')`,
    [id, JSON.stringify({ shop, ...opts.config })]
  )
  if (!opts.noToken) {
    const dead = new Date(Date.now() - 48 * HOUR - HOUR) // safely past the 24h buffer
    const status = opts.status ?? 'auth_failed'
    const createdAt = opts.createdAt ?? dead
    const lastRefreshedAt = opts.lastRefreshedAt === undefined ? dead : opts.lastRefreshedAt
    const expiresAt = opts.expiresAt === undefined ? dead : opts.expiresAt
    await sql(
      `insert into data.source_tokens (client_id, source, kind, secret, status, created_at, last_refreshed_at, expires_at)
       values ($1, 'shopify', 'shopify_admin', 'test-token', $2, $3, $4, $5)`,
      [id, status, createdAt, lastRefreshedAt, expiresAt]
    )
  }
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

async function notificationFor(shop: string): Promise<{ payload: Record<string, unknown> } | undefined> {
  const r = await sql<{ payload: Record<string, unknown> }>(
    `select payload from data.notifications where kind = 'shop_redact_needs_operator' and payload->>'shop' = $1`,
    [shop]
  )
  return r.rows[0]
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
  it('deletes only the matching client shopify rows and marks the row done (dead token)', async () => {
    const shop = shopFor(randomUUID())
    const client = await mkClient(shop) // default: dead token
    const other = await mkClient(shopFor(randomUUID())) // also dead by default, unaffected either way

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
    expect(await notificationFor(shop)).toBeDefined()
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

  it('is idempotent: a row already done or needs_operator is left alone on a second run', async () => {
    const shop = shopFor(randomUUID())
    await mkClient(shop) // dead token -> deletes
    const id = await queueRequest(shop)

    await shopRedact(mkTick())
    expect((await statusOf(id)).status).toBe('done')

    const n = await shopRedact(mkTick())
    expect(n).toBe(0) // nothing pending left to claim
    expect((await statusOf(id)).status).toBe('done')
  })

  // --- B1: the reconnect/token guard ---------------------------------------------------------

  it('B1: a live token (active, recent) escalates: needs_operator, 0 deleted', async () => {
    const shop = shopFor(randomUUID())
    const now = new Date()
    const client = await mkClient(shop, { status: 'active', createdAt: now, lastRefreshedAt: now, expiresAt: new Date(Date.now() + HOUR) })
    const id = await queueRequest(shop)

    const n = await shopRedact(mkTick())
    expect(n).toBe(1)

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/still active or recently used/)
    expect(await customerCount(client, 'shopify')).toBe(1)
  })

  it('B1: a replay after reconnect (active token, old created_at/last_refreshed_at) escalates', async () => {
    const shop = shopFor(randomUUID())
    const old = new Date(Date.now() - 100 * HOUR)
    // Mirrors attach_source's reconnect upsert: status flips to 'active' but created_at and
    // last_refreshed_at are never touched, so they stay old even though the shop just reconnected.
    const client = await mkClient(shop, { status: 'active', createdAt: old, lastRefreshedAt: old, expiresAt: old })
    const id = await queueRequest(shop)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/still active or recently used/)
    expect(await customerCount(client, 'shopify')).toBe(1)
  })

  it('B1: reconnect then a transient failure (auth_failed, old last_refreshed_at, expires_at within 24h) escalates', async () => {
    const shop = shopFor(randomUUID())
    const old = new Date(Date.now() - 100 * HOUR)
    const recentExpiry = new Date(Date.now() - HOUR) // within the 24h window
    const client = await mkClient(shop, { status: 'auth_failed', createdAt: old, lastRefreshedAt: old, expiresAt: recentExpiry })
    const id = await queueRequest(shop)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/still active or recently used/)
    expect(await customerCount(client, 'shopify')).toBe(1)
  })

  it('B1: a genuinely dead token (auth_failed, everything >48h old) is deleted', async () => {
    const shop = shopFor(randomUUID())
    const client = await mkClient(shop) // default fixture IS this scenario
    const id = await queueRequest(shop)

    const n = await shopRedact(mkTick())
    expect(n).toBe(1)
    expect((await statusOf(id)).status).toBe('done')
    expect(await customerCount(client, 'shopify')).toBe(0)
  })

  it('B1: a shop with no source_tokens row at all is deleted (token absent)', async () => {
    const shop = shopFor(randomUUID())
    const client = await mkClient(shop, { noToken: true })
    const id = await queueRequest(shop)

    const n = await shopRedact(mkTick())
    expect(n).toBe(1)
    expect((await statusOf(id)).status).toBe('done')
    expect(await customerCount(client, 'shopify')).toBe(0)
  })

  // --- S3: bridge shop reachable only via config, with a real client + dead token ------------

  it('S3: a client matching the bridge shop only via config.shop (no app marker) still escalates, rows survive', async () => {
    const bridgeShop = 'fa8a00-11.myshopify.com'
    const client = await mkClient(bridgeShop) // dead token, no config.app marker
    const id = await queueRequest(bridgeShop)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/sb-bridge/)
    expect(await customerCount(client, 'shopify')).toBe(1) // must survive even with a dead token
  })

  // --- S2: stuck rows ---------------------------------------------------------------------

  it('S2: a row with attempts >= 3 is escalated with the last recorded error', async () => {
    const shop = shopFor(randomUUID())
    const id = await queueRequest(shop)
    await sql(`update data.privacy_requests set attempts = 3, error = 'boom: connection reset' where id = $1`, [id])

    const n = await shopRedact(mkTick())
    expect(n).toBe(0) // escalateStuck claims it before the normal pending scan runs

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/boom: connection reset/)
  })

  it('S2: a row pending over 24h (attempts still 0) is escalated', async () => {
    const shop = shopFor(randomUUID())
    const oldReceivedAt = new Date(Date.now() - 25 * HOUR)
    const id = await queueRequest(shop, oldReceivedAt)

    await shopRedact(mkTick())

    const row = await statusOf(id)
    expect(row.status).toBe('needs_operator')
    expect(row.error).toMatch(/pending too long|repeated failures/)
  })
})
