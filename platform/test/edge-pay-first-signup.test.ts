// Pay-first sign-up on the Edge side, with every side effect injected (no Deno, DB or keys):
//  - the signup function's `exists` lookup mode (and that the Shopify-path request is untouched);
//  - the stripe-webhook branch that turns one paid, metadata-carrying Checkout session into
//    exactly one user + workspace + confirm mail, however many times Stripe delivers it.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handle as signupHandle, SIGNUP_REDIRECT, type SignupDeps } from '../supabase/functions/signup/handler.ts'
import { handle, type SignupWorkspaceInput, type StripeWebhookDeps } from '../supabase/functions/stripe-webhook/handler.ts'

const SECRET = 'whsec_test_fixture_secret'
const NOW = 1790000000
const fixture = (name: string) => readFileSync(new URL(`../../packages/app-core/tests/fixtures/stripe/${name}.json`, import.meta.url), 'utf8')
const sign = (body: string) => `t=${NOW},v1=${createHmac('sha256', SECRET).update(`${NOW}.${body}`).digest('hex')}`
const post = (body: string) =>
  new Request('https://p.supabase.co/functions/v1/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sign(body) }, body })

/** The recorded checkout.session.completed turned into a pay-first session: no client ref, signup metadata. */
function signupEvent(over: { eventId?: string; email?: string; name?: string; metadata?: Record<string, string> | null; customer?: string | null } = {}): string {
  const e = JSON.parse(fixture('checkout.session.completed'))
  e.id = over.eventId ?? 'evt_TestSignup0001'
  e.data.object.client_reference_id = null
  if (over.customer !== undefined) e.data.object.customer = over.customer
  e.data.object.metadata = over.metadata === null ? undefined : (over.metadata ?? { signup_name: over.name ?? 'Acme Bakery', signup_email: over.email ?? 'Owner@Acme.example ' })
  return JSON.stringify(e)
}

/** In-memory twin of the stripe-webhook signup deps: auth users, and the RPC's idempotency on customer id. */
function world(over: { rpcFails?: number; mailFails?: boolean; mailThrows?: boolean; withSignup?: boolean } = {}) {
  const users = new Map<string, string>() // email -> id
  const workspaces = new Map<string, SignupWorkspaceInput>() // customer -> input
  const memberships = new Set<string>()
  const mails: string[] = []
  const logs: Array<{ event: string; data: Record<string, unknown> }> = []
  const reads: unknown[] = []
  let rpcFails = over.rpcFails ?? 0
  const deps: StripeWebhookDeps = {
    now: () => NOW,
    async readState(clientId, customerId) { reads.push([clientId, customerId]); return null },
    async apply() { throw new Error('the lifecycle RPC must not run for a signup session') },
    log: (event, data) => logs.push({ event, data }),
    signup: over.withSignup === false ? undefined : {
      async createUser(email) {
        if (users.has(email)) return { userId: null, error: 'email_exists' }
        users.set(email, `u-${users.size + 1}`)
        return { userId: users.get(email)! }
      },
      async findUserId(email) { return users.get(email) ?? null },
      async createWorkspace(i) {
        if (rpcFails-- > 0) throw new Error('rpc down')
        if (workspaces.has(i.customerId)) return 'duplicate'
        if (memberships.has(i.userId)) return 'has_workspace'
        workspaces.set(i.customerId, i)
        memberships.add(i.userId)
        return 'created'
      },
      async sendConfirmation(email, redirectTo) {
        mails.push(`${email}|${redirectTo}`)
        if (over.mailThrows) throw new Error('smtp down')
        return over.mailFails ? { error: 'rate limited' } : {}
      },
    },
  }
  return { deps, users, workspaces, mails, logs, reads }
}

describe('pay-first sign-up: stripe-webhook creates the workspace', () => {
  it('one paid session creates one user, one workspace (customer, subscription, name, lowercased email) and one confirm mail', async () => {
    const w = world()
    expect((await handle(post(signupEvent()), SECRET, w.deps)).status).toBe(200)
    expect([...w.users.keys()]).toEqual(['owner@acme.example'])
    expect([...w.workspaces.values()]).toEqual([{
      eventId: 'evt_TestSignup0001', eventType: 'checkout.session.completed', eventCreated: NOW,
      userId: 'u-1', name: 'Acme Bakery', customerId: 'cus_TestFixture0001', subscriptionId: 'sub_TestFixture0001',
    }])
    expect(w.mails).toEqual([`owner@acme.example|${SIGNUP_REDIRECT}`])
    expect(w.reads).toEqual([]) // routed before readState, so never unknown_client
  })

  it('the same event replayed 2x, and a second event for the same session: still 1 user, 1 workspace, 1 mail', async () => {
    const w = world()
    for (const body of [signupEvent(), signupEvent(), signupEvent(), signupEvent({ eventId: 'evt_TestSignup0002' })]) {
      expect((await handle(post(body), SECRET, w.deps)).status).toBe(200)
    }
    expect(w.users.size).toBe(1)
    expect(w.workspaces.size).toBe(1)
    expect(w.mails.length).toBe(1)
  })

  it('a retry after the auth user was made but the RPC failed reuses that user (no failure) and mails once', async () => {
    const w = world({ rpcFails: 1 })
    expect((await handle(post(signupEvent()), SECRET, w.deps)).status).toBe(503)
    expect(w.users.size).toBe(1)
    expect(w.workspaces.size).toBe(0)
    expect(w.mails).toEqual([])
    expect((await handle(post(signupEvent()), SECRET, w.deps)).status).toBe(200)
    expect(w.users.size).toBe(1)
    expect(w.workspaces.size).toBe(1)
    expect(w.mails.length).toBe(1)
  })

  it('a second payment for an email that already has a workspace creates nothing and mails nothing', async () => {
    const w = world()
    await handle(post(signupEvent()), SECRET, w.deps)
    const again = signupEvent({ eventId: 'evt_TestSignup0003' }).replace('cus_TestFixture0001', 'cus_TestFixture0002')
    expect((await handle(post(again), SECRET, w.deps)).status).toBe(200)
    expect(w.workspaces.size).toBe(1)
    expect(w.mails.length).toBe(1)
    expect(w.logs.at(-1)).toEqual({ event: 'stripe_signup_applied', data: { eventId: 'evt_TestSignup0003', type: 'checkout.session.completed', outcome: 'has_workspace' } })
  })

  it('a mail failure after the workspace commits is logged, not retried (a retry would only see a duplicate)', async () => {
    for (const mode of [{ mailFails: true }, { mailThrows: true }]) {
      const w = world(mode)
      expect((await handle(post(signupEvent()), SECRET, w.deps)).status).toBe(200)
      expect(w.workspaces.size).toBe(1)
      expect(w.logs.map((l) => l.event)).toContain('stripe_signup_mail_failed')
    }
  })

  it('an unwired deps object answers 503 so Stripe retries; a session without a usable email/name/customer is ignored 200', async () => {
    expect((await handle(post(signupEvent()), SECRET, world({ withSignup: false }).deps)).status).toBe(503)
    for (const body of [
      signupEvent({ email: 'not-an-email' }), signupEvent({ name: '   ' }), signupEvent({ name: 'x'.repeat(101) }), signupEvent({ customer: null }),
    ]) {
      const w = world()
      expect((await handle(post(body), SECRET, w.deps)).status).toBe(200)
      expect(w.users.size + w.workspaces.size + w.mails.length).toBe(0)
    }
  })

  it('never logs the email or name', async () => {
    const w = world()
    await handle(post(signupEvent()), SECRET, w.deps)
    const logged = JSON.stringify(w.logs)
    expect(logged).not.toMatch(/acme/i)
  })

  it('a session that names a client, or carries no signup metadata, still takes the lifecycle path', async () => {
    const withRef = world()
    const ref = JSON.parse(signupEvent())
    ref.data.object.client_reference_id = 'c0000000-0000-4000-8000-0000000000c1'
    await handle(post(JSON.stringify(ref)), SECRET, withRef.deps)
    expect(withRef.reads).toEqual([['c0000000-0000-4000-8000-0000000000c1', 'cus_TestFixture0001']])
    const bare = world()
    await handle(post(signupEvent({ metadata: null })), SECRET, bare.deps)
    expect(bare.reads.length).toBe(1)
    expect(bare.workspaces.size).toBe(0)
  })
})

describe('signup function: the exists lookup mode', () => {
  const base = (over: Partial<SignupDeps> = {}): { deps: SignupDeps; calls: string[] } => {
    const calls: string[] = []
    const deps: SignupDeps = {
      enabled: true,
      createUser: async (e) => (calls.push(`createUser:${e}`), { userId: 'u' }),
      createClient: async () => (calls.push('createClient'), 'slug'),
      deleteUser: async () => {},
      sendConfirmation: async () => (calls.push('mail'), {}),
      log: () => {},
      ...over,
    }
    return { deps, calls }
  }
  const ask = (deps: SignupDeps, body: unknown) =>
    signupHandle(new Request('https://p.supabase.co/functions/v1/signup', { method: 'POST', body: JSON.stringify(body) }), deps)

  it('answers {exists} for a valid address and creates, deletes and mails nothing', async () => {
    const asked: string[] = []
    const { deps, calls } = base({ userExists: async (e) => (asked.push(e), e.startsWith('taken')) })
    const yes = await ask(deps, { mode: 'exists', email: ' Taken@Acme.example ' })
    expect([yes.status, await yes.json()]).toEqual([200, { exists: true }])
    const no = await ask(deps, { mode: 'exists', email: 'fresh@acme.example' })
    expect([no.status, await no.json()]).toEqual([200, { exists: false }])
    expect(asked).toEqual(['taken@acme.example', 'fresh@acme.example'])
    expect(calls).toEqual([])
  })

  it('stays dark behind SIGNUP_ENABLED, rejects a bad address, 503 without the dep, 502 when the lookup throws', async () => {
    expect((await ask(base({ enabled: false, userExists: async () => true }).deps, { mode: 'exists', email: 'a@b.example' })).status).toBe(404)
    expect((await ask(base({ userExists: async () => true }).deps, { mode: 'exists', email: 'nope' })).status).toBe(400)
    expect((await ask(base().deps, { mode: 'exists', email: 'a@b.example' })).status).toBe(503)
    expect((await ask(base({ userExists: async () => { throw new Error('gotrue') } }).deps, { mode: 'exists', email: 'a@b.example' })).status).toBe(502)
  })

  it('the Shopify-path request (name + email, no mode) is unchanged: still created and mailed, lookup never consulted', async () => {
    const { deps, calls } = base({ userExists: async () => { throw new Error('must not be called') } })
    const res = await ask(deps, { name: 'Acme', email: 'a@b.example' })
    expect([res.status, await res.json()]).toEqual([200, { ok: true }])
    expect(calls).toEqual(['createUser:a@b.example', 'createClient', 'mail'])
  })
})
