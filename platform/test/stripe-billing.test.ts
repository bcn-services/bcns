// Item 1 against the local stack (20261007000100_stripe_billing.sql): the guards that live in SQL,
// not in the Edge Function's TypeScript. The activation guard and the Shopify exemption are in
// api.stripe_apply_billing's WHERE, so these call the RPC directly with actions the TS half would
// never send. Also: dedupe, stale events, grace expiry (data.pause_lapsed_clients), the hook's
// paused case, api.billing_self, and that only service_role reaches the two write-path RPCs.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { anonClient, mintJwt, rest, serviceClient, sql } from './helpers.js'

const clients: string[] = []
const users: string[] = []
afterAll(async () => {
  for (const id of users) await serviceClient().auth.admin.deleteUser(id)
  if (clients.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [clients])
})

async function client(status: string, over: { paid_at?: string; grace_until?: string; sub?: string } = {}): Promise<string> {
  const r = await sql<{ id: string }>(
    `insert into data.clients (slug, name, status, paid_at, grace_until, stripe_subscription_id)
     values ($1, 'ZZ stripe fixture', $2, $3, $4, $5) returning id`,
    [`zz-stripe-${randomUUID().slice(0, 8)}`, status, over.paid_at ?? null, over.grace_until ?? null, over.sub ?? null])
  clients.push(r.rows[0].id)
  return r.rows[0].id
}

const status = async (id: string) =>
  (await sql<{ status: string; paid_at: Date | null; grace_until: Date | null; stripe_customer_id: string | null }>(
    `select status, paid_at, grace_until, stripe_customer_id from data.clients where id = $1`, [id])).rows[0]

async function owner(clientId: string): Promise<string> {
  const email = `zz-stripe-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password: 'password-zz', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'owner')`, [data.user.id, clientId])
  return data.user.id
}

const evt = () => `evt_zz${randomUUID().replace(/-/g, '')}`
const apply = (clientId: string, action: string, over: Record<string, unknown> = {}) =>
  serviceClient().rpc('stripe_apply_billing', {
    p_event_id: evt(), p_event_type: 'checkout.session.completed', p_event_created: new Date().toISOString(),
    p_client: clientId, p_action: action, p_customer: null, p_subscription: null, p_grace_until: null, ...over,
  })

describe('api.stripe_apply_billing', () => {
  it('activates a pending client and records the customer and payment time', async () => {
    const id = await client('pending')
    const customer = `cus_zz${randomUUID().slice(0, 8)}`
    const { data, error } = await apply(id, 'activate', { p_customer: customer, p_subscription: 'sub_zz1' })
    expect(error).toBeNull()
    expect(data).toBe('applied')
    const row = await status(id)
    expect(row.status).toBe('active')
    expect(row.paid_at).not.toBeNull()
    expect(row.stripe_customer_id).toBe(customer)
  })

  it('the activation guard: a churned client stays churned, whatever action is sent', async () => {
    const id = await client('churned', { paid_at: new Date().toISOString() })
    for (const action of ['activate', 'resume', 'record_payment']) {
      expect((await apply(id, action)).data, action).toBe('conflict')
    }
    expect((await status(id)).status).toBe('churned')
    expect((await sql(`select 1 from data.stripe_events where client_id = $1`, [id])).rowCount).toBe(0)
  })

  it('a pause bcns set by hand (never paid) is not resumed', async () => {
    const id = await client('paused')
    expect((await apply(id, 'resume')).data).toBe('conflict')
    expect((await status(id)).status).toBe('paused')
  })

  it('a Shopify-billed tenant is never activated', async () => {
    const id = await client('pending')
    await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
               values ($1, 'shopify', '1 hour', current_date - 7, $2::jsonb, now() + interval '1 day')`,
      [id, JSON.stringify({ shop: 'zz-stripe.myshopify.com' })])
    await sql(`insert into data.source_tokens (client_id, source, kind, secret) values ($1, 'shopify', 'shopify_admin', 'test-token')`, [id])
    expect((await apply(id, 'activate')).data).toBe('conflict')
    expect((await status(id)).status).toBe('pending')
  })

  it('the same event id applies once; an event older than the newest applied one is a conflict', async () => {
    const id = await client('pending')
    const eventId = evt()
    const now = new Date()
    expect((await apply(id, 'activate', { p_event_id: eventId, p_event_created: now.toISOString() })).data).toBe('applied')
    expect((await apply(id, 'record_payment', { p_event_id: eventId, p_event_created: now.toISOString() })).data).toBe('duplicate')
    const older = new Date(now.getTime() - 60_000).toISOString()
    expect((await apply(id, 'start_grace', { p_event_created: older, p_grace_until: now.toISOString() })).data).toBe('conflict')
    expect((await status(id)).grace_until).toBeNull()
  })

  it('grace starts only after a payment, and expiry pauses; a later payment resumes', async () => {
    const id = await client('active', { paid_at: new Date(Date.now() - 40 * 86400_000).toISOString(), sub: 'sub_zz2' })
    const past = new Date(Date.now() - 1000).toISOString()
    expect((await apply(id, 'start_grace', { p_subscription: 'sub_zz2', p_grace_until: past })).data).toBe('applied')
    const neverPaid = await client('active')
    expect((await apply(neverPaid, 'start_grace', { p_grace_until: past })).data).toBe('conflict')

    await sql(`select data.pause_lapsed_clients()`)
    expect((await status(id)).status).toBe('paused')
    expect((await status(neverPaid)).status).toBe('active')

    expect((await apply(id, 'resume')).data).toBe('applied')
    const row = await status(id)
    expect(row.status).toBe('active')
    expect(row.grace_until).toBeNull()
  })

  it('only service_role can call the write path', async () => {
    const id = await client('pending')
    const token = await mintJwt(randomUUID())
    for (const fn of ['stripe_apply_billing', 'stripe_billing_state']) {
      const { status: code } = await rest(`rpc/${fn}`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_client: id }) })
      expect(code, fn).toBeGreaterThanOrEqual(400)
      const anon = await anonClient().rpc(fn, { p_client: id })
      expect(anon.error, fn).not.toBeNull()
    }
    expect((await status(id)).status).toBe('pending')
  })
})

describe('paused sign-in and api.billing_self', () => {
  it('a paused owner gets a tenant-less token and reads only their own billing row', async () => {
    const id = await client('paused', { paid_at: new Date().toISOString() })
    const userId = await owner(id)
    const hook = await sql<{ r: any }>(`select public.custom_access_token_hook($1::jsonb) r`,
      [JSON.stringify({ user_id: userId, claims: { client_id: 'forged', client_role: 'owner' } })])
    expect(hook.rows[0].r.claims).toEqual({ client_status: 'paused' })

    const { status: code, body } = await rest('rpc/billing_self', await mintJwt(userId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(code).toBe(200)
    expect(body).toMatchObject({ client_id: id, role: 'owner', status: 'paused', shopify_billed: false })
    expect(typeof body.paid_at).toBe('number') // unix seconds, like stripe_billing_state
  })

  it('churned is still 403 at the hook', async () => {
    const id = await client('churned')
    const userId = await owner(id)
    const hook = await sql<{ r: any }>(`select public.custom_access_token_hook($1::jsonb) r`, [JSON.stringify({ user_id: userId, claims: {} })])
    expect(hook.rows[0].r.error.http_code).toBe(403)
  })
})

