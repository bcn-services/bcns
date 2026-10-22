// Owner Disconnect for Shopify (migration 20261022000100): api.disconnect_source accepts shopify,
// then worker revokeDisconnected revokes the app on Shopify's side and deletes the shop's rows
// (the same deletion shop/redact uses). The App Store reviewer outcome: after Disconnect a
// different shop connects. Fetch is stubbed; Shopify is never called. Every fixture client is
// synthetic, so the shared acme/beta/gamma seed is untouched.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { clientWithToken, mintJwt, pool, serviceClient, sql } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { API_VERSION } from '../worker/src/connectors/shopify-url.js'
import { revokeDisconnected } from '../worker/src/disconnect.js'

const made: string[] = []
const users: string[] = []

async function mkClient(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Shopify Disconnect', 'America/New_York')`, [id, `sd-${id.slice(0, 8)}`])
  return id
}

async function mkUser(client: string, role: 'owner' | 'member'): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `sd-${randomUUID().slice(0, 8)}@example.test`, password: 'password-sd', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, $3)`, [data.user.id, client, role])
  return mintJwt(data.user.id, { client_id: client })
}

const shopOf = (client: string) => `sd-${client.slice(0, 8)}.myshopify.com`

/** A connected source: token, schedule (shopify carries its shop), health row, a record, a product and a raw row. */
async function seed(client: string, source: 'shopify' | 'quickbooks', status = 'active', detail: string | null = null) {
  const shopify = source === 'shopify'
  const config = shopify ? { shop: shopOf(client) } : { realm_id: '123' }
  await sql(`insert into data.source_tokens (client_id, source, kind, secret, refresh_secret, status, status_detail)
             values ($1, $2, $3, 'access-secret', 'refresh-secret', $4, $5)`,
    [client, source, shopify ? 'shopify_admin' : 'quickbooks_oauth_refresh', status, detail])
  await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
             values ($1, $2, '1 hour', current_date - 7, $3::jsonb, now() + interval '1 day')`, [client, source, JSON.stringify(config)])
  await sql(`insert into data.connector_health (client_id, source, status, status_since) values ($1, $2, 'ok', now())`, [client, source])
  await sql(`insert into data.records (client_id, source, external_id, kind) values ($1, $2, 'r1', 'order')`, [client, source])
  await sql(`insert into data.products (client_id, source, external_id, title) values ($1, $2, 'p1', 'Thing')`, [client, source])
  await sql(`insert into data.raw (client_id, source, entity, external_id, fetched_at, payload_hash, payload)
             values ($1, $2, 'Order', '1', now(), 'h', '{}'::jsonb)`, [client, source])
}

async function counts(client: string, source: string) {
  const r = await sql(`select
    (select count(*)::int from data.source_tokens where client_id = $1 and source = $2) tokens,
    (select count(*)::int from data.connector_schedule where client_id = $1 and source = $2) schedule,
    (select count(*)::int from data.connector_health where client_id = $1 and source = $2) health,
    (select count(*)::int from data.records where client_id = $1 and source = $2) records,
    (select count(*)::int from data.products where client_id = $1 and source = $2) products,
    (select count(*)::int from data.raw where client_id = $1 and source = $2) raw`, [client, source])
  return r.rows[0]
}
const ALL = { tokens: 1, schedule: 1, health: 1, records: 1, products: 1, raw: 1 }
const NONE = { tokens: 0, schedule: 0, health: 0, records: 0, products: 0, raw: 0 }

const tokenOf = async (client: string) =>
  (await sql(`select status, status_detail from data.source_tokens where client_id = $1 and source = 'shopify'`, [client])).rows[0]

interface Call { url: string; init: RequestInit }
function mkTick(respond: () => Response | Promise<Response>, calls: Call[] = [], logs: unknown[][] = []): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `sd-${randomUUID().slice(0, 8)}`,
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond() }) as typeof fetch,
    stubbed: true, now: () => new Date(), log: (...a) => { logs.push(a) }, budgetMs: 60_000, claimLimit: 24,
  }
}
const ok = () => new Response('', { status: 200 })
const mine = (calls: Call[], client: string) => calls.filter(c => c.url.startsWith(`https://${shopOf(client)}/`))

const connect = (token: string, shop: string) =>
  clientWithToken(token).rpc('connect_source', {
    p_source: 'shopify', p_kind: 'shopify_admin', p_secret: 'shpat_test', p_config: { shop },
    p_interval: '1 hour', p_backfill_depth: '13 months',
    p_refresh_secret: 'rt-test', p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) {
    for (const t of ['notifications', 'raw', 'raw_latest', 'records', 'products', 'connector_health', 'connector_schedule', 'source_tokens']) {
      await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
    }
    await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  }
  await Promise.all([pool.end(), closePool()])
})

describe('api.disconnect_source: shopify', () => {
  it('owner with a live token: token revoked/owner_disconnect, schedule disabled, health row gone, data kept for the worker', async () => {
    const client = await mkClient()
    await seed(client, 'shopify')
    const { data, error } = await clientWithToken(await mkUser(client, 'owner')).rpc('disconnect_source', { p_source: 'shopify' })
    expect(error).toBeNull()
    expect(data).toBe(1)
    expect(await tokenOf(client)).toEqual({ status: 'revoked', status_detail: 'owner_disconnect' })
    expect((await sql(`select enabled from data.connector_schedule where client_id = $1 and source = 'shopify'`, [client])).rows[0].enabled).toBe(false)
    expect(await counts(client, 'shopify')).toEqual({ ...ALL, health: 0 })
  })

  it('a token already revoked by app/uninstalled (the dead-token card) still reaches owner_disconnect', async () => {
    const client = await mkClient()
    await seed(client, 'shopify', 'revoked', 'app uninstalled')
    const { data, error } = await clientWithToken(await mkUser(client, 'owner')).rpc('disconnect_source', { p_source: 'shopify' })
    expect(error).toBeNull()
    expect(data).toBe(1)
    expect(await tokenOf(client)).toEqual({ status: 'revoked', status_detail: 'owner_disconnect' })
  })

  it('the sb-bridge row (config.app = bcns-data, or the bridge shop) is refused with BCNS3 and nothing changes', async () => {
    for (const config of [{ shop: 'any.myshopify.com', app: 'bcns-data' }, { shop: 'FA8A00-11.myshopify.com' }]) {
      const client = await mkClient()
      await seed(client, 'shopify')
      await sql(`update data.connector_schedule set config = $2::jsonb where client_id = $1 and source = 'shopify'`, [client, JSON.stringify(config)])
      const { error } = await clientWithToken(await mkUser(client, 'owner')).rpc('disconnect_source', { p_source: 'shopify' })
      expect(error?.code).toBe('BCNS3')
      expect(error?.details).toBe('source')
      expect((await tokenOf(client)).status).toBe('active')
      expect(await counts(client, 'shopify')).toEqual(ALL)
    }
  })

  it('a member is refused (BCNS2) and nothing changes', async () => {
    const client = await mkClient()
    await seed(client, 'shopify')
    const { error } = await clientWithToken(await mkUser(client, 'member')).rpc('disconnect_source', { p_source: 'shopify' })
    expect(error?.code).toBe('BCNS2')
    expect((await tokenOf(client)).status).toBe('active')
    expect(await counts(client, 'shopify')).toEqual(ALL)
  })
})

describe('worker revokeDisconnected: shopify', () => {
  // Earlier tests leave owner_disconnect rows; process them so each test sees only its own.
  beforeAll(() => revokeDisconnected(mkTick(ok)))

  it('live token: DELETEs api_permissions on the shop, then purges this tenant\'s shopify rows only', async () => {
    const a = await mkClient(), b = await mkClient()
    await seed(a, 'shopify')
    await seed(a, 'quickbooks')
    await seed(b, 'shopify')
    expect((await clientWithToken(await mkUser(a, 'owner')).rpc('disconnect_source', { p_source: 'shopify' })).error).toBeNull()

    const calls: Call[] = [], logs: unknown[][] = []
    expect(await revokeDisconnected(mkTick(ok, calls, logs))).toBeGreaterThanOrEqual(1)
    const m = mine(calls, a)
    expect(m).toHaveLength(1)
    expect(m[0].url).toBe(`https://${shopOf(a)}/admin/api/${API_VERSION}/api_permissions/current.json`)
    expect(m[0].init.method).toBe('DELETE')
    expect((m[0].init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('access-secret')
    expect(mine(calls, b)).toHaveLength(0)
    expect(logs).toContainEqual(['shopify_disconnected', { client: a, source: 'shopify', outcome: 'revoked' }])
    expect(JSON.stringify(logs)).not.toMatch(/refresh-secret|access-secret/)

    expect(await counts(a, 'shopify')).toEqual(NONE)
    expect(await counts(a, 'quickbooks')).toEqual(ALL) // same tenant, other source
    expect(await counts(b, 'shopify')).toEqual(ALL) // other tenant, same source
  })

  it('dead token (app uninstalled, Shopify answers 401): still purged as already_invalid', async () => {
    const a = await mkClient(), b = await mkClient()
    await seed(a, 'shopify', 'revoked', 'app uninstalled')
    await seed(b, 'shopify')
    expect((await clientWithToken(await mkUser(a, 'owner')).rpc('disconnect_source', { p_source: 'shopify' })).error).toBeNull()

    const calls: Call[] = [], logs: unknown[][] = []
    await revokeDisconnected(mkTick(() => new Response('', { status: 401 }), calls, logs))
    expect(mine(calls, a)).toHaveLength(1)
    expect(logs).toContainEqual(['shopify_disconnected', { client: a, source: 'shopify', outcome: 'already_invalid' }])
    expect(await counts(a, 'shopify')).toEqual(NONE)
    expect(await counts(b, 'shopify')).toEqual(ALL)
  })

  it('a Shopify 5xx keeps the row for the next tick', async () => {
    const a = await mkClient()
    await seed(a, 'shopify')
    await sql(`select data.disconnect_source($1, 'shopify')`, [a])
    await revokeDisconnected(mkTick(() => new Response('', { status: 503 })))
    expect(await counts(a, 'shopify')).toEqual({ ...ALL, health: 0 })
    await revokeDisconnected(mkTick(ok))
    expect(await counts(a, 'shopify')).toEqual(NONE)
  })

  it('a bridge row force-marked owner_disconnect is left alone: no fetch, rows intact', async () => {
    const marker = await mkClient(), shop = await mkClient()
    await seed(marker, 'shopify', 'revoked', 'owner_disconnect')
    await sql(`update data.connector_schedule set config = '{"shop":"x.myshopify.com","app":"bcns-data"}'::jsonb where client_id = $1 and source = 'shopify'`, [marker])
    await seed(shop, 'shopify', 'revoked', 'owner_disconnect')
    await sql(`update data.connector_schedule set config = '{"shop":"fa8a00-11.myshopify.com"}'::jsonb where client_id = $1 and source = 'shopify'`, [shop])
    const calls: Call[] = [], logs: unknown[][] = []
    await revokeDisconnected(mkTick(ok, calls, logs))
    expect(calls.filter(c => c.url.includes('x.myshopify.com') || c.url.includes('fa8a00-11'))).toHaveLength(0)
    expect(logs).toContainEqual(['shopify_disconnect_skipped_bridge', { client: marker, source: 'shopify' }])
    expect(await counts(marker, 'shopify')).toEqual(ALL)
    expect(await counts(shop, 'shopify')).toEqual(ALL)
    await sql(`delete from data.source_tokens where client_id = any($1::uuid[])`, [[marker, shop]]) // keep later ticks quiet
  })

  it('another client holds an active token on the same shop: no DELETE (it would uninstall theirs), rows still purged', async () => {
    const a = await mkClient(), b = await mkClient()
    await seed(a, 'shopify', 'revoked', 'owner_disconnect')
    await seed(b, 'shopify')
    await sql(`update data.connector_schedule set config = jsonb_build_object('shop', $2::text) where client_id = $1 and source = 'shopify'`, [b, shopOf(a).toUpperCase()])
    const calls: Call[] = [], logs: unknown[][] = []
    await revokeDisconnected(mkTick(ok, calls, logs))
    expect(mine(calls, a)).toHaveLength(0)
    expect(logs).toContainEqual(['shopify_disconnected', { client: a, source: 'shopify', outcome: 'kept_for_sibling' }])
    expect(await counts(a, 'shopify')).toEqual(NONE)
    expect(await counts(b, 'shopify')).toEqual(ALL)
  })

  it('an operator-revoked shopify token is never auto-deleted', async () => {
    const a = await mkClient()
    await seed(a, 'shopify', 'revoked', 'operator')
    const calls: Call[] = []
    await revokeDisconnected(mkTick(ok, calls))
    expect(mine(calls, a)).toHaveLength(0)
    expect(await counts(a, 'shopify')).toEqual(ALL)
  })
})

describe('reviewer outcome: a second store after Disconnect', () => {
  beforeAll(() => revokeDisconnected(mkTick(ok)))

  it('BCNS7 holds until the worker purges, then a different shop connects', async () => {
    const client = await mkClient()
    await seed(client, 'shopify', 'revoked', 'app uninstalled')
    const token = await mkUser(client, 'owner')
    const other = `sd-other-${randomUUID().slice(0, 8)}.myshopify.com`
    const owner = clientWithToken(token)

    expect((await owner.rpc('disconnect_source', { p_source: 'shopify' })).error).toBeNull()
    // Before the worker runs: intentionally still refused.
    expect((await owner.rpc('shopify_shop_mismatch', { p_shop: other })).data).toBe(true)
    expect((await connect(token, other)).error?.code).toBe('BCNS7')

    await revokeDisconnected(mkTick(() => new Response('', { status: 401 })))
    expect(await counts(client, 'shopify')).toEqual(NONE)
    expect((await owner.rpc('shopify_shop_mismatch', { p_shop: other })).data).toBe(false)
    expect((await connect(token, other)).error).toBeNull()
    expect((await sql(`select config->>'shop' shop from data.connector_schedule where client_id = $1 and source = 'shopify'`, [client])).rows[0].shop).toBe(other)
  })
})
