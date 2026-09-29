// 2026-09-29 incident: a second tenant's owner bound a shop another tenant held. The new
// grant killed the holder's refresh token, and the holder's card went auth_failed with no
// reason shown (connector_schedule.last_error stayed null) and no worker log line.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CLIENTS, clientWithToken, localKeys, mintJwt, pool, serviceClient, sql, SUPABASE_URL } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { refreshTokens } from '../worker/src/tokens.js'
import { computeHealth } from '../worker/src/health.js'

const made: string[] = []
const users: string[] = []

async function mkClient(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Shop Guard', 'America/New_York')`, [id, `sg-${id.slice(0, 8)}`])
  return id
}

/** An owner of a fresh client, as the JWT the hub's session would carry. */
async function mkOwner(): Promise<{ client: string; token: string }> {
  const client = await mkClient()
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `sg-${client.slice(0, 8)}@example.test`, password: 'password-sg', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'owner')`, [data.user.id, client])
  return { client, token: await mintJwt(data.user.id, { client_id: client }) }
}

const connect = (token: string, shop: string) =>
  clientWithToken(token).rpc('connect_source', {
    p_source: 'shopify', p_kind: 'shopify_admin', p_secret: 'shpat_test', p_config: { shop },
    p_interval: '1 hour', p_backfill_depth: '13 months',
    p_refresh_secret: 'rt-test', p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })

const tokenOf = async (client: string) =>
  (await sql(`select status, secret from data.source_tokens where client_id = $1 and source = 'shopify'`, [client])).rows[0]
const lastError = async (client: string) =>
  (await sql<{ last_error: string | null }>(`select last_error from data.connector_schedule where client_id = $1 and source = 'shopify'`, [client])).rows[0]?.last_error

beforeAll(() => {
  process.env.SUPABASE_URL = SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = localKeys().service
})

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  // computeHealth below writes rows for the seeded clients too; put them back as worker.test.ts does.
  await sql(`update data.connector_health set status = 'never_ran', status_since = now(), last_run_at = null,
             last_success_at = null, last_error = null where client_id = any($1::uuid[])`, [Object.values(CLIENTS)])
  await Promise.all([pool.end(), closePool()])
})

describe('api.connect_source shop guard', () => {
  it('refuses a shop another client holds with an active token (BCNS6 shop_in_use)', async () => {
    const shop = `sg-${randomUUID().slice(0, 8)}.myshopify.com`
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, shop)).error).toBeNull()

    const { error } = await connect(b.token, shop)
    expect(error?.code).toBe('BCNS6')
    expect(error?.message).toBe('shop_in_use')
    expect(await tokenOf(b.client)).toBeUndefined()
    expect((await tokenOf(a.client)).status).toBe('active')
  })

  it('lets the same client reconnect its own shop, and the reconnect clears last_error', async () => {
    const shop = `sg-${randomUUID().slice(0, 8)}.myshopify.com`
    const a = await mkOwner()
    expect((await connect(a.token, shop)).error).toBeNull()
    await sql(`update data.source_tokens set status = 'auth_failed' where client_id = $1`, [a.client])
    await sql(`update data.connector_schedule set last_error = 'This request requires an active refresh_token', last_error_at = now() where client_id = $1`, [a.client])

    expect((await connect(a.token, shop)).error).toBeNull()
    expect((await tokenOf(a.client)).status).toBe('active')
    expect(await lastError(a.client)).toBeNull()
  })

  it('does not let an auth_failed holder block a new client', async () => {
    const shop = `sg-${randomUUID().slice(0, 8)}.myshopify.com`
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, shop)).error).toBeNull()
    await sql(`update data.source_tokens set status = 'auth_failed' where client_id = $1`, [a.client])

    expect((await connect(b.token, shop)).error).toBeNull()
    expect((await tokenOf(b.client)).status).toBe('active')
  })
})

describe('token refresh auth failure is surfaced', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const DEAD = 'This request requires an active refresh_token'

  function mkTick(fetch: typeof globalThis.fetch, logs: { event: string; data: Record<string, unknown> }[] = []): Tick {
    return {
      taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch, stubbed: true,
      now: () => new Date(), log: (event, data) => { logs.push({ event, data: data ?? {} }) }, budgetMs: 60_000, claimLimit: 24,
    }
  }
  const tokenFetch = (answer: () => Response) => (async (input: any) =>
    String(input?.url ?? input).endsWith('/admin/oauth/access_token') ? answer() : json({})) as typeof globalThis.fetch

  async function shopifyClient(status: 'active' | 'auth_failed', updatedAgo: string): Promise<string> {
    const c = await mkClient()
    await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
               values ($1, 'shopify', '1 hour', current_date - 7, $2::jsonb, now() + interval '1 day')`,
      [c, JSON.stringify({ shop: `sg-${c.slice(0, 8)}.myshopify.com` })])
    // updated_at is set by the `touch` trigger on UPDATE, so an old row can only be built on INSERT.
    await sql(`insert into data.source_tokens (client_id, source, kind, secret, refresh_secret, expires_at, status, updated_at)
               values ($1, 'shopify', 'shopify_admin', 'at-old', 'rt-old', now() + interval '5 minutes', $2, now() - $3::interval)`,
      [c, status, updatedAgo])
    return c
  }

  async function refresh(fetch: typeof globalThis.fetch, logs?: { event: string; data: Record<string, unknown> }[]) {
    Object.assign(process.env, { SHOPIFY_CLIENT_ID: 'cid-1', SHOPIFY_CLIENT_SECRET: 'csecret-1' })
    try {
      await refreshTokens(mkTick(fetch, logs))
    } finally {
      delete process.env.SHOPIFY_CLIENT_ID
      delete process.env.SHOPIFY_CLIENT_SECRET
    }
  }

  it('sets connector_schedule.last_error, logs token_refresh_auth_failed, and reaches connector_health', async () => {
    const c = await shopifyClient('active', '0 seconds')
    const logs: { event: string; data: Record<string, unknown> }[] = []
    await refresh(tokenFetch(() => json({ error: 'invalid_request', error_description: DEAD }, 401)), logs)

    expect((await tokenOf(c)).status).toBe('auth_failed')
    expect(await lastError(c)).toContain(DEAD)
    const log = logs.find(l => l.event === 'token_refresh_auth_failed' && l.data.client === c)
    expect(log?.data).toMatchObject({ source: 'shopify' })
    expect(String(log?.data.error)).toContain(DEAD)

    // The hub card reads connector_health_v1.last_error, which computeHealth copies from the schedule.
    await computeHealth(mkTick(tokenFetch(() => json({}))))
    const h = (await sql(`select status, last_error from data.connector_health where client_id = $1 and source = 'shopify'`, [c])).rows[0]
    expect(h).toMatchObject({ status: 'auth_failed' })
    expect(h.last_error).toContain(DEAD)
  })

  it('a successful refresh of an auth_failed row clears last_error', async () => {
    const c = await shopifyClient('auth_failed', '2 hours')
    await sql(`update data.connector_schedule set last_error = $2, last_error_at = now() where client_id = $1`, [c, DEAD])
    await refresh(tokenFetch(() => json({ access_token: 'at-new', expires_in: 3600, refresh_token: 'rt-new' })))

    expect((await tokenOf(c)).status).toBe('active')
    expect(await lastError(c)).toBeNull()
  })

  it('a routine refresh of a healthy row leaves a sync run\'s last_error alone', async () => {
    const c = await shopifyClient('active', '0 seconds')
    await sql(`update data.connector_schedule set last_error = 'orders query failed', last_error_at = now() where client_id = $1`, [c])
    await refresh(tokenFetch(() => json({ access_token: 'at-new', expires_in: 3600, refresh_token: 'rt-new' })))

    expect((await tokenOf(c)).secret).toBe('at-new')
    expect(await lastError(c)).toBe('orders query failed')
  })
})
