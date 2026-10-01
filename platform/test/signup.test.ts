// P1 owner self-service sign-up, against the local stack: api.signup_create_client, the hook's
// pending case, RLS staying closed for a pending owner, the hourly cap, and activate-client.
// Builds its own pending fixtures (seed.sql is not touched) and removes them afterwards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { anonClient, apiViews, clientWithToken, decodeJwt, localKeys, mintJwt, rest, serviceClient, sql, SUPABASE_URL, USERS } from './helpers.js'
import { main as activate } from '../scripts/activate-client.js'
import { ScriptError } from '../scripts/_lib.js'

const PASSWORD = 'password-pending'
const users: string[] = []
const clients: string[] = []

async function newUser(): Promise<{ id: string; email: string }> {
  const email = `zz-signup-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  return { id: data.user.id, email }
}

/** The Edge Function's second step, called exactly as signupDeps() calls it: service role, api schema. */
async function signupClient(userId: string, name: string) {
  const res = await serviceClient().rpc('signup_create_client', { p_user_id: userId, p_name: name })
  if (typeof res.data === 'string') {
    clients.push((await sql(`select id from data.clients where slug = $1`, [res.data])).rows[0].id)
  }
  return res
}

/** GoTrue password grant (runs the hook); raw so the 403 status is visible. */
async function passwordGrant(email: string) {
  return fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: localKeys().anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
}

async function pendingToken(email: string): Promise<string> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`)
  return data.session.access_token
}

const connect = (token: string) =>
  clientWithToken(token).rpc('connect_source', {
    p_source: 'shopify', p_kind: 'shopify_admin', p_secret: 'shpat_test', p_config: { shop: 'zz-pending.myshopify.com' },
    p_interval: '1 hour', p_backfill_depth: '13 months',
    p_refresh_secret: 'rt-test', p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })

let owner: { id: string; email: string }
let pendingId: string
let pendingSlug: string

beforeAll(async () => {
  owner = await newUser()
  const { data, error } = await signupClient(owner.id, 'ZZ Pending Bakery!')
  expect(error).toBeNull()
  pendingSlug = data as string
  pendingId = clients[0]
})

afterAll(async () => {
  if (clients.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [clients])
  await sql(`delete from data.clients where slug like 'zz-cap-%'`)
  for (const id of users) await serviceClient().auth.admin.deleteUser(id)
})

describe('api.signup_create_client', () => {
  it('creates a pending client and its owner membership, with a slug derived from the name', async () => {
    expect(pendingSlug).toMatch(/^zz-pending-bakery(-\d+)?$/)
    const row = (await sql(`select c.status, c.name, m.role from data.clients c join data.memberships m on m.client_id = c.id where m.user_id = $1`, [owner.id])).rows
    expect(row).toEqual([{ status: 'pending', name: 'ZZ Pending Bakery!', role: 'owner' }])
  })

  it('de-duplicates the slug for a second client with the same name', async () => {
    const second = await newUser()
    const { data, error } = await signupClient(second.id, 'ZZ Pending Bakery!')
    expect(error).toBeNull()
    expect(data).toBe(`${pendingSlug.replace(/-\d+$/, '')}-${Number(pendingSlug.match(/-(\d+)$/)?.[1] ?? 1) + 1}`)
  })

  it('a user who already has a client gets nothing new: 23505, and no second client row', async () => {
    const before = (await sql(`select count(*)::int n from data.clients`)).rows[0].n
    const { error } = await signupClient(owner.id, 'ZZ Second Try')
    expect(error?.code).toBe('23505')
    expect((await sql(`select count(*)::int n from data.clients`)).rows[0].n).toBe(before)
  })

  it('only service_role may call it: anon and authenticated are refused', async () => {
    const stranger = await newUser()
    expect((await anonClient().rpc('signup_create_client', { p_user_id: stranger.id, p_name: 'ZZ Anon' })).error?.code).toBe('42501')
    const { data } = await anonClient().auth.signInWithPassword({ email: USERS.acmeOwner.email, password: USERS.acmeOwner.password })
    const asOwner = clientWithToken(data.session!.access_token)
    expect((await asOwner.rpc('signup_create_client', { p_user_id: stranger.id, p_name: 'ZZ Authed' })).error?.code).toBe('42501')
    expect((await sql(`select 1 from data.memberships where user_id = $1`, [stranger.id])).rowCount).toBe(0)
  })
})

describe('pending owner (hook + RLS)', () => {
  it('signs in with client_status pending and no tenant claims; every api view is empty and RPCs raise BCNS0', async () => {
    const token = await pendingToken(owner.email)
    const claims = decodeJwt(token)
    expect(claims.client_status).toBe('pending')
    expect(claims.client_id).toBeUndefined()
    expect(claims.client_role).toBeUndefined()
    for (const v of await apiViews()) expect((await rest(`${v}?limit=5`, token)).body, v).toEqual([])
    const { error } = await clientWithToken(token).rpc('save_record', { kind: 'note', attributes: {}, external_id: 'zz-pending', title: 'x' })
    expect(error?.code).toBe('BCNS0')
  })

  it('cannot connect_source, even with a forged tenant claim for its own pending client', async () => {
    expect((await connect(await pendingToken(owner.email))).error?.code).toBe('BCNS0')
    const forged = await mintJwt(owner.id, { client_id: pendingId, client_role: 'owner' })
    for (const v of await apiViews()) expect((await rest(`${v}?limit=5`, forged)).body, v).toEqual([])
    expect((await connect(forged)).error?.code).toBe('BCNS0')
    expect((await sql(`select 1 from data.source_tokens where client_id = $1`, [pendingId])).rowCount).toBe(0)
  })

  it('paused, churned and no-membership are still 403 at the hook', async () => {
    const other = await newUser()
    expect((await signupClient(other.id, 'ZZ Status Probe')).error).toBeNull()
    const otherClient = clients[clients.length - 1]
    try {
      for (const status of ['paused', 'churned']) {
        await sql(`update data.clients set status = $2 where id = $1`, [otherClient, status])
        const r = await passwordGrant(other.email)
        expect(r.status, status).toBe(403)
        expect(await r.text(), status).toContain(`client ${status}`)
      }
    } finally {
      await sql(`update data.clients set status = 'pending', churned_at = null where id = $1`, [otherClient])
    }
    const nobody = await newUser()
    const r = await passwordGrant(nobody.email)
    expect(r.status).toBe(403)
    expect(await r.text()).toContain('no membership')
  })
})

describe('abuse bound', () => {
  it('at most 10 pending clients per rolling hour: the next call raises BCNS8 and creates nothing', async () => {
    const recent = (await sql(`select count(*)::int n from data.clients where status = 'pending' and created_at > now() - interval '1 hour'`)).rows[0].n
    for (let i = recent; i < 10; i++) {
      await sql(`insert into data.clients (slug, name, status) values ($1, 'ZZ cap fixture', 'pending')`, [`zz-cap-${i}`])
    }
    try {
      const late = await newUser()
      const before = (await sql(`select count(*)::int n from data.clients`)).rows[0].n
      const { error } = await signupClient(late.id, 'ZZ Over The Cap')
      expect(error?.code).toBe('BCNS8')
      expect((await sql(`select count(*)::int n from data.clients`)).rows[0].n).toBe(before)
      expect((await sql(`select 1 from data.memberships where user_id = $1`, [late.id])).rowCount).toBe(0)
    } finally {
      await sql(`delete from data.clients where slug like 'zz-cap-%'`)
    }
  })
})

describe('activate-client', () => {
  it('refuses any client that is not pending, and leaves its status alone', async () => {
    for (const status of ['active', 'paused', 'churned']) {
      const slug = `zz-cap-activate-${status}`
      await sql(`insert into data.clients (slug, name, status) values ($1, 'ZZ activate fixture', $2)`, [slug, status])
      await expect(activate(['--slug', slug]), status).rejects.toThrow(ScriptError)
      expect((await sql(`select status from data.clients where slug = $1`, [slug])).rows[0].status, status).toBe(status)
    }
    await expect(activate(['--slug', 'zz-no-such-client'])).rejects.toThrow(/no client/)
  })

  it('pending -> active, after which the owner signs in with tenant claims', async () => {
    await activate(['--slug', pendingSlug])
    expect((await sql(`select status from data.clients where id = $1`, [pendingId])).rows[0].status).toBe('active')
    const claims = decodeJwt(await pendingToken(owner.email))
    expect(claims.client_id).toBe(pendingId)
    expect(claims.client_role).toBe('owner')
    expect(claims.client_status).toBeUndefined()
  })
})
