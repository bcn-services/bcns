// One external account = one tenant for Meta (act_id), Monday (board_id) and QuickBooks
// (realm_id): data.attach_source refuses an id another client holds with an ACTIVE token
// (BCNS6 source_in_use), and api.source_in_use is the hub's early check. Google is not guarded.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID, randomInt } from 'node:crypto'
import pg from 'pg'
import { anonClient, clientWithToken, mintJwt, DB_URL, pool, serviceClient, sql } from './helpers.js'

const made: string[] = []
const users: string[] = []

async function mkClient(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Source Guard', 'America/New_York')`, [id, `tg-${id.slice(0, 8)}`])
  return id
}

/** An owner of a fresh client, as the JWT the hub's session would carry. */
async function mkOwner(): Promise<{ client: string; token: string }> {
  const client = await mkClient()
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `tg-${client.slice(0, 8)}@example.test`, password: 'password-tg', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'owner')`, [data.user.id, client])
  return { client, token: await mintJwt(data.user.id, { client_id: client }) }
}

const digits = () => String(randomInt(10 ** 9, 10 ** 10))
const soon = () => new Date(Date.now() + 3600_000).toISOString()

// Same shapes as apps/connect/lib/{meta,monday,quickbooks,google}-oauth.ts connectArgs.
type Case = { source: 'meta' | 'monday' | 'quickbooks'; key: string; id: () => string; args: (id: string) => Record<string, unknown> }
const CASES: Case[] = [
  { source: 'meta', key: 'act_id', id: () => `act_${digits()}`,
    args: id => ({ p_source: 'meta', p_kind: 'meta_system_user', p_secret: 'at-test', p_config: { act_id: id },
      p_interval: '1 hour', p_backfill_depth: '13 months', p_refresh_secret: null, p_expires_at: soon() }) },
  { source: 'monday', key: 'board_id', id: digits,
    args: id => ({ p_source: 'monday', p_kind: 'monday_personal', p_secret: 'at-test', p_config: { board_id: id },
      p_interval: '1 hour', p_backfill_depth: '13 months' }) },
  { source: 'quickbooks', key: 'realm_id', id: digits,
    args: id => ({ p_source: 'quickbooks', p_kind: 'quickbooks_oauth_refresh', p_secret: 'at-test', p_config: { realm_id: id },
      p_interval: '1 hour', p_backfill_depth: '24 months', p_refresh_secret: 'rt-test', p_expires_at: soon() }) },
]

const connect = (token: string, args: Record<string, unknown>) => clientWithToken(token).rpc('connect_source', args)
const inUse = (token: string, source: string, id: string) => clientWithToken(token).rpc('source_in_use', { p_source: source, p_id: id })
const tokenOf = async (client: string, source: string) =>
  (await sql<{ status: string }>(`select status from data.source_tokens where client_id = $1 and source = $2`, [client, source])).rows[0]
const scheduleOf = async (client: string, source: string) =>
  (await sql<{ config: Record<string, string> }>(`select config from data.connector_schedule where client_id = $1 and source = $2`, [client, source])).rows[0]

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  await pool.end()
})

describe.each(CASES)('$source: one $key, one tenant', ({ source, key, id: mkId, args }) => {
  it('refuses an id another client holds with an active token (BCNS6 source_in_use) and writes nothing for the second', async () => {
    const id = mkId()
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, args(id))).error).toBeNull()

    const { error } = await connect(b.token, args(id))
    expect(error?.code).toBe('BCNS6')
    expect(error?.message).toBe('source_in_use')
    expect(await tokenOf(b.client, source)).toBeUndefined()
    expect(await scheduleOf(b.client, source)).toBeUndefined()
    expect((await tokenOf(a.client, source)).status).toBe('active')
  })

  it('lets the same client reconnect its own id', async () => {
    const id = mkId()
    const a = await mkOwner()
    expect((await connect(a.token, args(id))).error).toBeNull()
    expect((await connect(a.token, args(id))).error).toBeNull()
    expect((await tokenOf(a.client, source)).status).toBe('active')
  })

  it('does not let an auth_failed holder block another client', async () => {
    const id = mkId()
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, args(id))).error).toBeNull()
    await sql(`update data.source_tokens set status = 'auth_failed' where client_id = $1 and source = $2`, [a.client, source])

    expect((await connect(b.token, args(id))).error).toBeNull()
    expect((await tokenOf(b.client, source)).status).toBe('active')
  })

  it('lets one client switch to a different id', async () => {
    const first = mkId(), second = mkId()
    const a = await mkOwner()
    expect((await connect(a.token, args(first))).error).toBeNull()
    expect((await connect(a.token, args(second))).error).toBeNull()
    expect((await scheduleOf(a.client, source)).config[key]).toBe(second)
  })

  it('api.source_in_use: true for another client\'s active id, false for the caller\'s own and for a free one', async () => {
    const id = mkId()
    const a = await mkOwner(), b = await mkOwner()
    expect((await inUse(b.token, source, id))).toMatchObject({ data: false, error: null })
    expect((await connect(a.token, args(id))).error).toBeNull()
    expect(await inUse(b.token, source, id)).toMatchObject({ data: true, error: null })
    expect(await inUse(a.token, source, id)).toMatchObject({ data: false, error: null })
    expect(await inUse(b.token, source, mkId())).toMatchObject({ data: false, error: null })
  })
})

describe('google stays unguarded', () => {
  it('two tenants can connect drive on the same folder_id', async () => {
    const folder = `folder-${randomUUID().slice(0, 8)}`
    const drive = {
      p_source: 'drive', p_kind: 'google_oauth_refresh', p_secret: 'at-test', p_refresh_secret: 'rt-test', p_expires_at: soon(),
      p_config: { folder_id: folder, oauth_client_id: 'cid-test' }, p_interval: '1 hour', p_backfill_depth: '13 months',
    }
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, drive)).error).toBeNull()
    expect((await connect(b.token, drive)).error).toBeNull()
    expect((await tokenOf(a.client, 'drive')).status).toBe('active')
    expect((await tokenOf(b.client, 'drive')).status).toBe('active')
  })
})

describe('api.source_in_use access', () => {
  it('is false for google and unknown sources, even on an id another tenant holds', async () => {
    const a = await mkOwner(), holder = await mkOwner()
    const folder = `folder-${randomUUID().slice(0, 8)}`
    const drive = {
      p_source: 'drive', p_kind: 'google_oauth_refresh', p_secret: 'at-test', p_refresh_secret: 'rt-test', p_expires_at: soon(),
      p_config: { folder_id: folder, oauth_client_id: 'cid-test' }, p_interval: '1 hour', p_backfill_depth: '13 months',
    }
    expect((await connect(holder.token, drive)).error).toBeNull()
    expect(await inUse(a.token, 'drive', folder)).toMatchObject({ data: false, error: null })
    expect(await inUse(a.token, 'meet', folder)).toMatchObject({ data: false, error: null })
    expect(await inUse(a.token, 'shopify', 'x.myshopify.com')).toMatchObject({ data: false, error: null })
    expect(await inUse(a.token, 'not-a-source', 'x')).toMatchObject({ data: false, error: null })
  })

  it('is owner-only: a member is BCNS2, anon and service_role are refused', async () => {
    const a = await mkOwner()
    const { data, error } = await serviceClient().auth.admin.createUser({
      email: `tgm-${a.client.slice(0, 8)}@example.test`, password: 'password-tg', email_confirm: true })
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
    users.push(data.user.id)
    await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'member')`, [data.user.id, a.client])
    const member = await mintJwt(data.user.id, { client_id: a.client })
    expect((await inUse(member, 'meta', 'act_1')).error?.code).toBe('BCNS2')
    const args = { p_source: 'meta', p_id: 'act_1' }
    expect((await anonClient().rpc('source_in_use', args)).error).not.toBeNull()
    expect((await serviceClient().schema('api').rpc('source_in_use', args)).error).not.toBeNull()
  })
})

// Two concurrent connects of one id: without attach_source's advisory lock both pass the
// source_in_use check (neither sees the other's uncommitted row) and both commit.
describe('concurrent connects of one id', () => {
  it('the second blocks on the lock until the first commits, then raises BCNS6 source_in_use', async () => {
    const id = `act_${digits()}`
    const a = await mkClient(), b = await mkClient()
    const attach = (c: pg.Client, client: string) => c.query(
      `select data.attach_source($1, 'meta', 'meta_system_user', 'at-test', null, null, null, $2::jsonb, '1 hour', current_date)`,
      [client, JSON.stringify({ act_id: id })])
    const c1 = new pg.Client({ connectionString: DB_URL }), c2 = new pg.Client({ connectionString: DB_URL })
    await Promise.all([c1.connect(), c2.connect()])
    try {
      await c1.query('begin')
      await c2.query('begin')
      await attach(c1, a)
      let settled = false
      const second = attach(c2, b).then(() => 'ok' as const, (e: { code?: string; message?: string }) => e)
      void second.then(() => { settled = true })
      await new Promise(r => setTimeout(r, 1000))
      expect(settled, 'second connect should be blocked on the advisory lock').toBe(false)
      await c1.query('commit')
      const res = await second
      expect(res).toMatchObject({ code: 'BCNS6', message: 'source_in_use' })
      await c2.query('rollback')
      expect(await tokenOf(b, 'meta')).toBeUndefined()
      expect((await tokenOf(a, 'meta')).status).toBe('active')
    } finally {
      await Promise.all([c1.query('rollback').catch(() => {}), c2.query('rollback').catch(() => {})])
      await Promise.all([c1.end(), c2.end()])
    }
  }, 20_000)
})
