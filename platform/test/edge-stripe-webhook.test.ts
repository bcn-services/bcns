// stripe-webhook Edge Function (item 1): its own signature check, the decision copy, and the
// handler with every side effect injected. Node only — no Deno, no database (the SQL guards are
// covered by stripe-billing.test.ts against the local stack).
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handle, parseState, type ApplyInput, type StripeWebhookDeps } from '../supabase/functions/stripe-webhook/handler.ts'
import { verifyStripeSignature, STRIPE_TOLERANCE_SEC } from '../supabase/functions/_shared/stripe-signature.ts'

const SECRET = 'whsec_test_fixture_secret'
const NOW = 1790000000
const CID = 'c0000000-0000-4000-8000-0000000000c1'
const fixturePath = (name: string) => new URL(`../../packages/app-core/tests/fixtures/stripe/${name}.json`, import.meta.url)
const fixture = (name: string) => readFileSync(fixturePath(name), 'utf8')
const sign = (body: string, t = NOW, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
const bytes = (s: string) => new TextEncoder().encode(s)

describe('stripe-webhook: decision copy', () => {
  it('_shared/app-core/subscription.ts is byte-identical to packages/app-core/src/subscription.ts', () => {
    const copy = readFileSync(new URL('../supabase/functions/_shared/app-core/subscription.ts', import.meta.url), 'utf8')
    const source = readFileSync(new URL('../../packages/app-core/src/subscription.ts', import.meta.url), 'utf8')
    expect(copy).toBe(source)
  })
})

describe('stripe-webhook: its own signature check', () => {
  const body = fixture('checkout.session.completed')

  it('accepts a correctly signed body', async () => {
    expect(await verifyStripeSignature(bytes(body), sign(body), SECRET, NOW)).toBe(true)
  })

  it('signature compare rejects a wrong secret, a tampered body and a wrong digest', async () => {
    expect(await verifyStripeSignature(bytes(body), sign(body, NOW, 'whsec_other'), SECRET, NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body.replace('"paid"', '"unpaid"')), sign(body), SECRET, NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body), `t=${NOW},v1=${'a'.repeat(64)}`, SECRET, NOW)).toBe(false)
  })

  it('rejects a validly signed timestamp outside the tolerance, accepts the edge', async () => {
    expect(await verifyStripeSignature(bytes(body), sign(body, NOW - STRIPE_TOLERANCE_SEC - 1), SECRET, NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body), sign(body, NOW + STRIPE_TOLERANCE_SEC + 1), SECRET, NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body), sign(body, NOW - STRIPE_TOLERANCE_SEC), SECRET, NOW)).toBe(true)
  })

  it('fails closed on an empty secret, a missing header, no t, no v1', async () => {
    expect(await verifyStripeSignature(bytes(body), sign(body, NOW, ''), '', NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body), null, SECRET, NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body), sign(body).replace(/^t=\d+,/, ''), SECRET, NOW)).toBe(false)
    expect(await verifyStripeSignature(bytes(body), `t=${NOW}`, SECRET, NOW)).toBe(false)
  })
})

type Row = Record<string, unknown>
const row = (over: Row = {}): Row => ({
  client_id: CID, status: 'pending', paid_at: null, grace_until: null, subscription_id: null,
  shopify_billed: false, last_event_at: null, ...over,
})

function harness(state: Row | null, outcome: 'applied' | 'duplicate' | 'conflict' = 'applied') {
  const applied: ApplyInput[] = []
  const reads: Array<[string | null, string | null]> = []
  const logs: Array<{ event: string; data: Record<string, unknown> }> = []
  const deps: StripeWebhookDeps = {
    now: () => NOW,
    async readState(clientId, customerId) {
      reads.push([clientId, customerId])
      return state
    },
    async apply(input) {
      applied.push(input)
      return outcome
    },
    log: (event, data) => logs.push({ event, data }),
  }
  return { deps, applied, reads, logs }
}

const post = (body: string, headers: Record<string, string> = { 'Stripe-Signature': sign(body) }) =>
  new Request('https://p.supabase.co/functions/v1/stripe-webhook', { method: 'POST', headers, body })

describe('stripe-webhook: handler', () => {
  it('checkout.session.completed on a pending client activates it, by client_reference_id', async () => {
    const h = harness(row())
    const body = fixture('checkout.session.completed')
    const res = await handle(post(body), SECRET, h.deps)
    expect(res.status).toBe(200)
    expect(h.reads).toEqual([[CID, 'cus_TestFixture0001']])
    expect(h.applied).toEqual([{
      eventId: 'evt_TestCheckoutCompleted', eventType: 'checkout.session.completed', eventCreated: NOW,
      clientId: CID, action: 'activate', customerId: 'cus_TestFixture0001', subscriptionId: 'sub_TestFixture0001', graceUntil: null,
    }])
  })

  it('a lapse after paying starts 30 days of grace; one that never paid changes nothing', async () => {
    const body = fixture('customer.subscription.deleted')
    const created = JSON.parse(body).created as number
    const paidUp = harness(row({ status: 'active', paid_at: NOW - 86400, subscription_id: 'sub_TestFixture0001' }))
    expect((await handle(post(body), SECRET, paidUp.deps)).status).toBe(200)
    expect(paidUp.applied.map((a) => [a.action, a.graceUntil])).toEqual([['start_grace', created + 30 * 86400]])
    const neverPaid = harness(row())
    expect((await handle(post(body), SECRET, neverPaid.deps)).status).toBe(200)
    expect(neverPaid.applied).toEqual([])
  })

  it('a churned client is not reactivated by a payment', async () => {
    const h = harness(row({ status: 'churned', paid_at: NOW - 86400 }))
    expect((await handle(post(fixture('invoice.paid')), SECRET, h.deps)).status).toBe(200)
    expect(h.applied).toEqual([])
  })

  it('a Shopify-billed tenant is never activated', async () => {
    const h = harness(row({ shopify_billed: true }))
    expect((await handle(post(fixture('checkout.session.completed')), SECRET, h.deps)).status).toBe(200)
    expect(h.applied).toEqual([])
  })

  it('past_due (Stripe still retrying), unknown events and unknown customers write nothing', async () => {
    const h = harness(row({ status: 'active', paid_at: 1 }))
    expect((await handle(post(fixture('customer.subscription.updated.past_due')), SECRET, h.deps)).status).toBe(200)
    const other = JSON.stringify({ id: 'evt_TestOther', type: 'charge.refunded', created: NOW, data: { object: {} } })
    expect((await handle(post(other), SECRET, h.deps)).status).toBe(200)
    expect(h.reads).toEqual([])
    const unknown = harness(null)
    expect((await handle(post(fixture('invoice.paid')), SECRET, unknown.deps)).status).toBe(200)
    expect(unknown.applied).toEqual([])
  })

  it('a replay is 200 (the RPC dedupes); a moved row is 503 so Stripe retries', async () => {
    expect((await handle(post(fixture('invoice.paid')), SECRET, harness(row(), 'duplicate').deps)).status).toBe(200)
    expect((await handle(post(fixture('invoice.paid')), SECRET, harness(row(), 'conflict').deps)).status).toBe(503)
  })

  it('refuses before reading state: no secret 503, missing signature 401, GET 405, oversized 413, bad JSON 400', async () => {
    const h = harness(row())
    const body = fixture('checkout.session.completed')
    expect((await handle(post(body), undefined, h.deps)).status).toBe(503)
    expect((await handle(post(body, {}), SECRET, h.deps)).status).toBe(401)
    expect((await handle(new Request('https://p.supabase.co/x', { method: 'GET' }), SECRET, h.deps)).status).toBe(405)
    const big = 'x'.repeat(256 * 1024 + 1)
    expect((await handle(post(big), SECRET, h.deps)).status).toBe(413)
    expect((await handle(post('{nope'), SECRET, h.deps)).status).toBe(400)
    const badId = JSON.stringify({ id: 'nope', type: 'invoice.paid', created: NOW, data: { object: {} } })
    expect((await handle(post(badId), SECRET, h.deps)).status).toBe(400)
    expect(h.reads).toEqual([])
    expect(h.applied).toEqual([])
  })

  it('a client_reference_id that is not a uuid is dropped, and the customer id is used instead', async () => {
    const h = harness(row())
    const e = JSON.parse(fixture('checkout.session.completed'))
    e.data.object.client_reference_id = "x' or 1=1"
    await handle(post(JSON.stringify(e)), SECRET, h.deps)
    expect(h.reads).toEqual([[null, 'cus_TestFixture0001']])
  })

  it('never logs the payload or the signature', async () => {
    const h = harness(row())
    const body = fixture('checkout.session.completed')
    await handle(post(body), SECRET, h.deps)
    const logged = JSON.stringify(h.logs)
    expect(logged).not.toContain('success_url')
    expect(logged).not.toContain('v1=')
  })
})

describe('stripe-webhook: parseState', () => {
  it('a row without an explicit shopify_billed false is treated as Shopify-billed', () => {
    expect(parseState(row({ shopify_billed: undefined }))?.shopifyBilled).toBe(true)
    expect(parseState(row())?.shopifyBilled).toBe(false)
    expect(parseState(row({ status: 'weird' }))).toBeNull()
    expect(parseState(null)).toBeNull()
  })
})
