// shopify-shop-redact Edge Function: the policy, with every side effect injected.
// Runs on node under the normal platform suite — no Deno, no database. HMAC is the
// only auth here (no caller JWT), so the one rule worth a test each: nothing is
// written unless the signature verifies against the raw bytes, and the shop is
// bound from the SIGNED body, never an unsigned header.
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { handle, type ShopRedactDeps } from '../supabase/functions/shopify-shop-redact/handler.ts'

const SECRET = 'shpss_test_secret'
const SHOP = 'acme-detailing.myshopify.com'
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('base64')

interface Recorded {
  inserts: Array<{ shop: string; webhookId: string }>
  logs: Array<{ event: string; data: Record<string, unknown> }>
}

function deps(insertedOverride?: boolean): { deps: ShopRedactDeps; rec: Recorded } {
  const rec: Recorded = { inserts: [], logs: [] }
  return {
    rec,
    deps: {
      async recordShopRedact(shop, webhookId) {
        rec.inserts.push({ shop, webhookId })
        return { inserted: insertedOverride ?? true }
      },
      log(event, data) {
        rec.logs.push({ event, data })
      },
    },
  }
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://p.supabase.co/functions/v1/shopify-shop-redact', {
    method: 'POST',
    headers,
    body,
  })
}

describe('shopify-shop-redact', () => {
  it('a valid HMAC queues exactly one row', async () => {
    const { deps: d, rec } = deps(true)
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(rec.inserts).toEqual([{ shop: SHOP, webhookId: 'wh-1' }])
  })

  it('a replayed webhook id queues nothing new (inserted: false), still 200', async () => {
    const { deps: d, rec } = deps(false)
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
    expect(res.status).toBe(200)
    expect(rec.inserts).toEqual([{ shop: SHOP, webhookId: 'wh-1' }])
    expect(rec.logs.at(-1)).toMatchObject({ event: 'shop_redact_queued', data: { inserted: false } })
  })

  it('an invalid HMAC is 401 and writes nothing', async () => {
    const { deps: d, rec } = deps()
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body, 'wrong'), 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
    expect(res.status).toBe(401)
    expect(rec.inserts).toEqual([])
  })

  it('a missing HMAC header is 401 and writes nothing', async () => {
    const { deps: d, rec } = deps()
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(post(body, { 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
    expect(res.status).toBe(401)
    expect(rec.inserts).toEqual([])
  })

  it('a missing SHOPIFY_CLIENT_SECRET fails closed: 401, nothing written', async () => {
    const { deps: d, rec } = deps()
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Webhook-Id': 'wh-1' }), undefined, d)
    expect(res.status).toBe(401)
    expect(rec.inserts).toEqual([])
  })

  it('a malformed JSON body is 400 after a valid HMAC over those exact bytes', async () => {
    const { deps: d, rec } = deps()
    const body = 'not json'
    const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
    expect(res.status).toBe(400)
    expect(rec.inserts).toEqual([])
  })

  it('the shop is bound from the signed body, never the unsigned X-Shopify-Shop-Domain header', async () => {
    const { deps: d, rec } = deps()
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(
      post(body, {
        'X-Shopify-Hmac-Sha256': sign(body),
        'X-Shopify-Webhook-Id': 'wh-1',
        'X-Shopify-Shop-Domain': 'attacker-controlled.myshopify.com',
      }),
      SECRET,
      d,
    )
    expect(res.status).toBe(200)
    expect(rec.inserts).toEqual([{ shop: SHOP, webhookId: 'wh-1' }])
  })

  it('a bad shop_domain in the signed body is 400 and writes nothing', async () => {
    const { deps: d, rec } = deps()
    for (const shop of ['not-a-shop', 'acme.example.com', '', 'acme.myshopify.com.evil.com']) {
      const body = JSON.stringify({ shop_domain: shop })
      const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
      expect(res.status, shop).toBe(400)
    }
    expect(rec.inserts).toEqual([])
  })

  it('a missing webhook id is 400 and writes nothing (auth already passed, this is a shape problem)', async () => {
    const { deps: d, rec } = deps()
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(post(body, { 'X-Shopify-Hmac-Sha256': sign(body) }), SECRET, d)
    expect(res.status).toBe(400)
    expect(rec.inserts).toEqual([])
  })

  it('an absurdly long webhook id is 400 and writes nothing', async () => {
    const { deps: d, rec } = deps()
    const body = JSON.stringify({ shop_domain: SHOP })
    const res = await handle(
      post(body, { 'X-Shopify-Hmac-Sha256': sign(body), 'X-Shopify-Webhook-Id': 'x'.repeat(500) }),
      SECRET,
      d,
    )
    expect(res.status).toBe(400)
    expect(rec.inserts).toEqual([])
  })

  it('GET is 405', async () => {
    const { deps: d } = deps()
    const res = await handle(new Request('https://p.supabase.co/functions/v1/shopify-shop-redact'), SECRET, d)
    expect(res.status).toBe(405)
  })

  it('never logs the payload, the HMAC header, or the secret', async () => {
    const { deps: d, rec } = deps(true)
    const body = JSON.stringify({ shop_domain: SHOP })
    const header = sign(body)
    await handle(post(body, { 'X-Shopify-Hmac-Sha256': header, 'X-Shopify-Webhook-Id': 'wh-1' }), SECRET, d)
    const serialized = JSON.stringify(rec.logs)
    expect(serialized).not.toContain(SECRET)
    expect(serialized).not.toContain(header)
    expect(serialized).not.toContain(body)
  })
})
