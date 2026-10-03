// Owner-initiated QuickBooks disconnect: api.disconnect_source (migration 20261002000100) marks
// the token revoked; worker disconnect.ts revokes it at Intuit and deletes the client's
// QuickBooks rows. Every fixture client is synthetic, so the shared acme/beta/gamma seed is untouched.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { clientWithToken, mintJwt, pool, serviceClient, sql } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { INTUIT_REVOKE_URL, revokeDisconnected } from '../worker/src/disconnect.js'
import { probeAuthFailed } from '../worker/src/tokens.js'

const made: string[] = []
const users: string[] = []

async function mkClient(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'QB Disconnect', 'America/New_York')`, [id, `qd-${id.slice(0, 8)}`])
  return id
}

async function mkUser(client: string, role: 'owner' | 'member'): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `qd-${randomUUID().slice(0, 8)}@example.test`, password: 'password-qd', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, $3)`, [data.user.id, client, role])
  return mintJwt(data.user.id, { client_id: client })
}

/**
 * A connected source for `client`: token, schedule, health row, one canonical + one raw row.
 * A 'revoked' token defaults to status_detail 'owner_disconnect' (what api.disconnect_source writes);
 * `age` backdates the token's updated_at (an insert, so the touch trigger does not run).
 */
async function seed(client: string, source: 'quickbooks' | 'shopify', status = 'active',
  opts: { detail?: string | null; age?: string } = {}) {
  const detail = opts.detail !== undefined ? opts.detail : status === 'revoked' ? 'owner_disconnect' : null
  const kind = source === 'quickbooks' ? 'quickbooks_oauth_refresh' : 'shopify_admin'
  const config = source === 'quickbooks' ? { realm_id: '123' } : { shop: `qd-${client.slice(0, 8)}.myshopify.com` }
  await sql(`insert into data.source_tokens (client_id, source, kind, secret, refresh_secret, status, status_detail, updated_at)
             values ($1, $2, $3, 'access-secret', 'refresh-secret', $4, $5, now() - $6::interval)`,
    [client, source, kind, status, detail, opts.age ?? '0'])
  await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
             values ($1, $2, '1 hour', current_date - 7, $3::jsonb, now() + interval '1 day')`, [client, source, JSON.stringify(config)])
  await sql(`insert into data.connector_health (client_id, source, status, status_since) values ($1, $2, 'ok', now())`, [client, source])
  await sql(`insert into data.records (client_id, source, external_id, kind) values ($1, $2, 'r1', 'qbo_expense')`, [client, source])
  await sql(`insert into data.raw (client_id, source, entity, external_id, fetched_at, payload_hash, payload)
             values ($1, $2, 'Purchase', '1', now(), 'h', '{}'::jsonb)`, [client, source])
}

async function counts(client: string, source: string) {
  const r = await sql(`select
    (select count(*)::int from data.source_tokens where client_id = $1 and source = $2) tokens,
    (select count(*)::int from data.connector_schedule where client_id = $1 and source = $2) schedule,
    (select count(*)::int from data.connector_health where client_id = $1 and source = $2) health,
    (select count(*)::int from data.records where client_id = $1 and source = $2) records,
    (select count(*)::int from data.raw where client_id = $1 and source = $2) raw`, [client, source])
  return r.rows[0]
}
const ALL = { tokens: 1, schedule: 1, health: 1, records: 1, raw: 1 }
const NONE = { tokens: 0, schedule: 0, health: 0, records: 0, raw: 0 }

const tokenOf = async (client: string, source = 'quickbooks') =>
  (await sql(`select status, status_detail from data.source_tokens where client_id = $1 and source = $2`, [client, source])).rows[0]

interface Call { url: string; init: RequestInit }
function mkTick(respond: () => Response | Promise<Response>, calls: Call[] = [], logs: unknown[][] = []): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `qd-${randomUUID().slice(0, 8)}`,
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond() }) as typeof fetch,
    stubbed: true, now: () => new Date(), log: (...a) => { logs.push(a) }, budgetMs: 60_000, claimLimit: 24,
  }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeAll(() => {
  process.env.QUICKBOOKS_CLIENT_ID = 'qb-id'
  process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-secret'
})

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) {
    for (const t of ['notifications', 'raw', 'raw_latest', 'records', 'connector_health', 'connector_schedule', 'source_tokens']) {
      await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
    }
    await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  }
  delete process.env.QUICKBOOKS_CLIENT_ID
  delete process.env.QUICKBOOKS_CLIENT_SECRET
  await Promise.all([pool.end(), closePool()])
})

describe('api.disconnect_source', () => {
  it('owner revokes QuickBooks: token revoked, schedule disabled, health row gone, data kept for the worker', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks')
    const { data, error } = await clientWithToken(await mkUser(client, 'owner')).rpc('disconnect_source', { p_source: 'quickbooks' })
    expect(error).toBeNull()
    expect(data).toBe(1)
    expect(await tokenOf(client)).toEqual({ status: 'revoked', status_detail: 'owner_disconnect' })
    expect((await sql(`select enabled from data.connector_schedule where client_id = $1 and source = 'quickbooks'`, [client])).rows[0].enabled).toBe(false)
    expect(await counts(client, 'quickbooks')).toEqual({ ...ALL, health: 0 })
  })

  it('a member is refused (BCNS2) and nothing changes', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks')
    const { error } = await clientWithToken(await mkUser(client, 'member')).rpc('disconnect_source', { p_source: 'quickbooks' })
    expect(error?.code).toBe('BCNS2')
    expect((await tokenOf(client)).status).toBe('active')
    expect(await counts(client, 'quickbooks')).toEqual(ALL)
  })

  it('a non-quickbooks source raises BCNS3 and leaves that source alone', async () => {
    const client = await mkClient()
    await seed(client, 'shopify')
    const { error } = await clientWithToken(await mkUser(client, 'owner')).rpc('disconnect_source', { p_source: 'shopify' })
    expect(error?.code).toBe('BCNS3')
    expect((await tokenOf(client, 'shopify')).status).toBe('active')
    expect(await counts(client, 'shopify')).toEqual(ALL)
  })

  it('touches only the caller\'s tenant', async () => {
    const mine = await mkClient(), other = await mkClient()
    await seed(mine, 'quickbooks')
    await seed(other, 'quickbooks')
    const { error } = await clientWithToken(await mkUser(mine, 'owner')).rpc('disconnect_source', { p_source: 'quickbooks' })
    expect(error).toBeNull()
    expect((await tokenOf(other)).status).toBe('active')
    expect(await counts(other, 'quickbooks')).toEqual(ALL)
  })
})

describe('worker revokeDisconnected', () => {
  // The RPC tests above leave revoked rows; process them first so each test sees only its own.
  beforeAll(() => revokeDisconnected(mkTick(() => new Response('', { status: 200 }))))

  it('revokes at Intuit, then deletes the token, schedule, health and QuickBooks data (other sources kept)', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks', 'revoked')
    await seed(client, 'shopify')
    const calls: Call[] = [], logs: unknown[][] = []
    const n = await revokeDisconnected(mkTick(() => new Response('', { status: 200 }), calls, logs))
    expect(n).toBeGreaterThanOrEqual(1)
    expect(await counts(client, 'quickbooks')).toEqual(NONE)
    expect(await counts(client, 'shopify')).toEqual(ALL)

    const mine = calls.filter(c => JSON.parse(String(c.init.body)).token === 'refresh-secret')
    expect(mine).toHaveLength(1)
    expect(mine[0].url).toBe(INTUIT_REVOKE_URL)
    expect(mine[0].init.method).toBe('POST')
    const h = mine[0].init.headers as Record<string, string>
    expect(h.Authorization).toBe(`Basic ${Buffer.from('qb-id:qb-secret').toString('base64')}`)
    expect(h.accept).toBe('application/json')
    expect(h['content-type']).toBe('application/json')
    // Never the token in a log line.
    expect(JSON.stringify(logs)).not.toMatch(/refresh-secret|access-secret/)
  })

  it('falls back to the access token when no refresh token is stored', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks', 'revoked')
    await sql(`update data.source_tokens set refresh_secret = null where client_id = $1 and source = 'quickbooks'`, [client])
    const calls: Call[] = []
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 }), calls))
    expect(calls.some(c => JSON.parse(String(c.init.body)).token === 'access-secret')).toBe(true)
    expect(await counts(client, 'quickbooks')).toEqual(NONE)
  })

  it('already invalid at Intuit (400 invalid_grant): rows still deleted', async () => {
    const a = await mkClient()
    await seed(a, 'quickbooks', 'revoked')
    await revokeDisconnected(mkTick(() => json(400, { error: 'invalid_grant' })))
    expect(await counts(a, 'quickbooks')).toEqual(NONE)
  })

  it('401 invalid_client (our app credentials, not the token) keeps the row', async () => {
    const b = await mkClient()
    await seed(b, 'quickbooks', 'revoked')
    await revokeDisconnected(mkTick(() => json(401, { error: 'invalid_client' })))
    expect(await counts(b, 'quickbooks')).toEqual(ALL)
    expect((await tokenOf(b)).status).toBe('revoked')
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
  })

  it('a QuickBooks row revoked for any other reason (operator) is never auto-deleted', async () => {
    const op = await mkClient()
    await seed(op, 'quickbooks', 'revoked', { detail: 'operator' })
    const calls: Call[] = []
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 }), calls))
    expect(calls).toHaveLength(0)
    expect(await counts(op, 'quickbooks')).toEqual(ALL)
  })

  it('an in-flight run (schedule lease held) keeps the row until the lease ends', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks', 'revoked')
    await sql(`update data.connector_schedule set lease_until = now() + interval '10 minutes', lease_owner = 'run'
               where client_id = $1 and source = 'quickbooks'`, [client])
    const calls: Call[] = []
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 }), calls))
    expect(calls).toHaveLength(0)
    expect(await counts(client, 'quickbooks')).toEqual(ALL)
    await sql(`update data.connector_schedule set lease_until = now() - interval '1 second' where client_id = $1 and source = 'quickbooks'`, [client])
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
    expect(await counts(client, 'quickbooks')).toEqual(NONE)
  })

  it('stuck over 24h: one quickbooks_revoke_stuck notification per client per day, row kept', async () => {
    const old = await mkClient(), fresh = await mkClient()
    await seed(old, 'quickbooks', 'revoked', { age: '25 hours' })
    await seed(fresh, 'quickbooks', 'revoked')
    // 4xx so the loop does not stop after the first client.
    for (let i = 0; i < 2; i++) await revokeDisconnected(mkTick(() => json(403, { error: 'forbidden' })))
    const notes = await sql(`select client_id, dedupe_key from data.notifications where kind = 'quickbooks_revoke_stuck' and client_id = any($1::uuid[])`, [[old, fresh]])
    expect(notes.rows).toEqual([{ client_id: old, dedupe_key: expect.stringMatching(new RegExp(`^quickbooks_revoke_stuck:${old}:\\d{4}-\\d{2}-\\d{2}$`)) }])
    expect(await counts(old, 'quickbooks')).toEqual(ALL)
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
  })

  it('a transient failure stops the pass: one Intuit call, not one per client', async () => {
    const a = await mkClient(), b = await mkClient()
    await seed(a, 'quickbooks', 'revoked')
    await seed(b, 'quickbooks', 'revoked')
    const calls: Call[] = []
    await revokeDisconnected(mkTick(() => json(503, { error: 'unavailable' }), calls))
    expect(calls).toHaveLength(1)
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
  })

  it('a 5xx or a network error keeps the row for the next tick', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks', 'revoked')
    const logs: unknown[][] = []
    await revokeDisconnected(mkTick(() => json(503, { error: 'unavailable' }), [], logs))
    expect(await counts(client, 'quickbooks')).toEqual(ALL)
    expect((await tokenOf(client)).status).toBe('revoked')
    expect(logs.some(l => l[0] === 'quickbooks_revoke_failed')).toBe(true)
    await revokeDisconnected(mkTick(() => { throw new TypeError('fetch failed') }))
    expect(await counts(client, 'quickbooks')).toEqual(ALL)
    // Recovers on a later tick.
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
    expect(await counts(client, 'quickbooks')).toEqual(NONE)
  })

  it('missing app credentials: no Intuit call, row kept', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks', 'revoked')
    delete process.env.QUICKBOOKS_CLIENT_SECRET
    try {
      const calls: Call[] = []
      await revokeDisconnected(mkTick(() => new Response('', { status: 401 }), calls))
      expect(calls).toHaveLength(0)
      expect(await counts(client, 'quickbooks')).toEqual(ALL)
    } finally {
      process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-secret'
    }
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
  })

  it('leaves a revoked Shopify row and an active QuickBooks row alone', async () => {
    const shop = await mkClient(), live = await mkClient()
    await seed(shop, 'shopify', 'revoked')
    await seed(live, 'quickbooks')
    const calls: Call[] = []
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 }), calls))
    expect(calls).toHaveLength(0)
    expect(await counts(shop, 'shopify')).toEqual(ALL)
    expect(await counts(live, 'quickbooks')).toEqual(ALL)
  })
})

describe('probeAuthFailed vs an owner disconnect', () => {
  it('a probe that succeeds after the owner disconnected does not flip the row back to active', async () => {
    const client = await mkClient()
    await seed(client, 'quickbooks', 'auth_failed', { age: '2 hours' })
    process.env.QUICKBOOKS_ENV = 'sandbox'
    let probed = false
    // The owner disconnects while the probe's HTTP call is in flight.
    const t = mkTick(async () => {
      probed = true
      await sql(`select data.disconnect_source($1, 'quickbooks')`, [client])
      return json(200, { CompanyInfo: { Id: '123' } })
    })
    try { await probeAuthFailed(t) } finally { delete process.env.QUICKBOOKS_ENV }
    expect(probed).toBe(true)
    expect(await tokenOf(client)).toEqual({ status: 'revoked', status_detail: 'owner_disconnect' })
    await revokeDisconnected(mkTick(() => new Response('', { status: 200 })))
  })
})
