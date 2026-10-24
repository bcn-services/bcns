// api.shopify_shop_in_use (20261025000100): the early form of attach_source's BCNS6 check.
// The hub's /finish asks it BEFORE exchanging Shopify's code, because that exchange is a new
// grant and retires the refresh token the holding tenant has stored (2026-10-24 incident).
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { anonClient, clientWithToken, mintJwt, pool, serviceClient, sql } from './helpers.js'

const made: string[] = []
const users: string[] = []

async function mkUser(client: string, role: 'owner' | 'member'): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `siu-${role}-${client.slice(0, 8)}@example.test`, password: 'password-siu', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, $3)`, [data.user.id, client, role])
  return mintJwt(data.user.id, { client_id: client })
}

/** An owner of a fresh client, as the JWT the hub's session would carry. */
async function mkOwner(): Promise<{ client: string; token: string }> {
  const client = randomUUID()
  made.push(client)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Shop In Use', 'America/New_York')`, [client, `siu-${client.slice(0, 8)}`])
  return { client, token: await mkUser(client, 'owner') }
}

const connect = (token: string, shop: string) =>
  clientWithToken(token).rpc('connect_source', {
    p_source: 'shopify', p_kind: 'shopify_admin', p_secret: 'shpat_test', p_config: { shop },
    p_interval: '1 hour', p_backfill_depth: '13 months',
    p_refresh_secret: 'rt-test', p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })
const inUse = (token: string, shop: string) => clientWithToken(token).rpc('shopify_shop_in_use', { p_shop: shop })
const newShop = () => `siu-${randomUUID().slice(0, 8)}.myshopify.com`
const setStatus = (client: string, status: string) =>
  sql(`update data.source_tokens set status = $2 where client_id = $1 and source = 'shopify'`, [client, status])

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  await pool.end()
})

describe('api.shopify_shop_in_use', () => {
  it('is true when another client holds the shop with an active token, in any case', async () => {
    const shop = newShop()
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, shop)).error).toBeNull()
    expect(await inUse(b.token, shop)).toMatchObject({ data: true, error: null })
    expect(await inUse(b.token, shop.toUpperCase())).toMatchObject({ data: true, error: null })
  })

  it('agrees with attach_source: whenever it says true, connect_source raises BCNS6', async () => {
    const shop = newShop()
    const a = await mkOwner(), b = await mkOwner()
    expect((await connect(a.token, shop)).error).toBeNull()
    expect((await inUse(b.token, shop)).data).toBe(true)
    expect((await connect(b.token, shop)).error?.code).toBe('BCNS6')
  })

  it('is false for the caller\'s own shop, an unknown shop, and an auth_failed or revoked holder', async () => {
    const shop = newShop()
    const a = await mkOwner(), b = await mkOwner()
    expect(await inUse(b.token, shop)).toMatchObject({ data: false, error: null })
    expect((await connect(a.token, shop)).error).toBeNull()
    expect(await inUse(a.token, shop)).toMatchObject({ data: false, error: null })
    await setStatus(a.client, 'auth_failed')
    expect(await inUse(b.token, shop)).toMatchObject({ data: false, error: null })
    await setStatus(a.client, 'revoked')
    expect(await inUse(b.token, shop)).toMatchObject({ data: false, error: null })
  })

  it('is owner-only: a member is BCNS2, anon and service_role are refused', async () => {
    const a = await mkOwner()
    const member = await mkUser(a.client, 'member')
    expect((await inUse(member, 'x.myshopify.com')).error?.code).toBe('BCNS2')
    expect((await anonClient().rpc('shopify_shop_in_use', { p_shop: 'x.myshopify.com' })).error).not.toBeNull()
    expect((await serviceClient().schema('api').rpc('shopify_shop_in_use', { p_shop: 'x.myshopify.com' })).error).not.toBeNull()
  })
})
