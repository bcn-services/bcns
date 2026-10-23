// api.stripe_signup_workspace (20261023163848): pay-first sign-up's one write. Called exactly as
// the stripe-webhook Edge Function calls it (service role, api schema). Checks the workspace is
// born active and owned, a replayed event and a second event for the same customer write nothing,
// a user who already has a workspace gets none (and bcns gets a notification), bad input is
// refused, and only service_role can run it.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { anonClient, mintJwt, rest, serviceClient, sql, USERS } from './helpers.js'

const users: string[] = []
const customers: string[] = []
afterAll(async () => {
  if (customers.length) {
    await sql(`delete from data.notifications where dedupe_key = any($1::text[])`, [customers.map((c) => `stripe_signup_existing:${c}`)])
    await sql(`delete from data.clients where stripe_customer_id = any($1::text[])`, [customers])
  }
  for (const id of users) await serviceClient().auth.admin.deleteUser(id)
})

async function newUser(): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `zz-paysignup-${randomUUID().slice(0, 8)}@example.test`, email_confirm: false,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  return data.user.id
}

const evt = () => `evt_zz${randomUUID().replace(/-/g, '')}`
const cus = () => {
  const c = `cus_zz${randomUUID().slice(0, 10).replace(/-/g, '')}`
  customers.push(c)
  return c
}

function create(userId: string, customer: string, over: Record<string, unknown> = {}) {
  return serviceClient().rpc('stripe_signup_workspace', {
    p_event_id: evt(), p_event_type: 'checkout.session.completed', p_event_created: new Date().toISOString(),
    p_user_id: userId, p_name: 'ZZ Pay First Bakery!', p_customer: customer, p_subscription: 'sub_zz1', ...over,
  })
}

const rows = async (customer: string) =>
  (await sql<{ id: string; slug: string; status: string; paid_at: Date | null; stripe_subscription_id: string | null }>(
    `select id, slug, status, paid_at, stripe_subscription_id from data.clients where stripe_customer_id = $1`, [customer])).rows

describe('api.stripe_signup_workspace', () => {
  it('creates an active client with the Stripe ids, an owner membership and the activate event row', async () => {
    const user = await newUser()
    const customer = cus()
    const { data, error } = await create(user, customer)
    expect(error).toBeNull()
    expect(data).toBe('created')
    const [client] = await rows(customer)
    expect(client.status).toBe('active')
    expect(client.paid_at).not.toBeNull()
    expect(client.stripe_subscription_id).toBe('sub_zz1')
    expect(client.slug).toMatch(/^zz-pay-first-bakery/)
    const m = await sql(`select role from data.memberships where user_id = $1 and client_id = $2`, [user, client.id])
    expect(m.rows).toEqual([{ role: 'owner' }])
    const e = await sql(`select action from data.stripe_events where client_id = $1`, [client.id])
    expect(e.rows).toEqual([{ action: 'activate' }])
  })

  it('a replayed event and a second event for the same customer both answer duplicate: one client, one membership', async () => {
    const user = await newUser()
    const customer = cus()
    const eventId = evt()
    expect((await create(user, customer, { p_event_id: eventId })).data).toBe('created')
    expect((await create(user, customer, { p_event_id: eventId })).data).toBe('duplicate')
    expect((await create(user, customer)).data).toBe('duplicate') // a different event, same session/customer
    const [client] = await rows(customer)
    expect((await rows(customer)).length).toBe(1)
    const m = await sql(`select count(*)::int n from data.memberships where client_id = $1`, [client.id])
    expect(m.rows[0].n).toBe(1)
    const e = await sql(`select count(*)::int n from data.stripe_events where client_id = $1`, [client.id])
    expect(e.rows[0].n).toBe(1)
  })

  it('a user who already belongs to a client gets no second workspace; bcns gets one notification row, once', async () => {
    const user = await newUser()
    const first = cus()
    expect((await create(user, first)).data).toBe('created')
    const second = cus()
    expect((await create(user, second)).data).toBe('has_workspace')
    expect((await create(user, second)).data).toBe('has_workspace')
    expect(await rows(second)).toEqual([])
    const n = await sql(`select kind, client_id from data.notifications where dedupe_key = $1`, [`stripe_signup_existing:${second}`])
    expect(n.rows.length).toBe(1)
    expect(n.rows[0].kind).toBe('stripe_second_subscription')
  })

  it('two businesses with the same name get distinct slugs', async () => {
    const [a, b] = [cus(), cus()]
    expect((await create(await newUser(), a)).data).toBe('created')
    expect((await create(await newUser(), b)).data).toBe('created')
    const slugs = [...(await rows(a)), ...(await rows(b))].map((r) => r.slug)
    expect(new Set(slugs).size).toBe(2)
  })

  it('refuses bad input before writing anything', async () => {
    const user = await newUser()
    const customer = cus()
    for (const bad of [
      { p_event_id: 'nope' }, { p_user_id: null }, { p_name: '   ' }, { p_name: 'x'.repeat(101) },
      { p_customer: null }, { p_customer: "cus_x' or 1=1" }, { p_subscription: 'bad' }, { p_event_created: null },
    ]) {
      const { error } = await create(user, customer, bad)
      expect(error?.code, JSON.stringify(bad)).toBe('BCNS3')
    }
    expect(await rows(customer)).toEqual([])
  })

  it('only service_role can run it: anon and a signed-in member are refused', async () => {
    const args = {
      p_event_id: evt(), p_event_type: 'checkout.session.completed', p_event_created: new Date().toISOString(),
      p_user_id: randomUUID(), p_name: 'ZZ', p_customer: cus(), p_subscription: null,
    }
    expect((await anonClient().rpc('stripe_signup_workspace', args)).error).not.toBeNull()
    const res = await rest('rpc/stripe_signup_workspace', await mintJwt(USERS.acmeOwner.id), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Profile': 'api' }, body: JSON.stringify(args),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
