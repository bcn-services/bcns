// P9: Shopify access ends when a paid period ends (worker/src/paid-period.ts). The pure half:
// no DB, no network. paid-period.db.test.ts drives the real step against the local stack.
import { describe, expect, it } from 'vitest'
import { checkSubscription, decide, isPublicApp, readSubscriptions, SKEW_MS, type SubscriptionAnswer } from '../worker/src/paid-period.js'

const NOW = new Date('2026-10-26T12:00:00Z')
const ENDED = new Date('2026-10-25T16:29:00Z') // stored paid-through, well past + skew
const body = (subs: unknown) => ({ data: { currentAppInstallation: { activeSubscriptions: subs } } })
const NONE: SubscriptionAnswer = { kind: 'none' }

describe('decide: revoke only when the period really ended', () => {
  it('revokes on a clean empty subscription list after the stored date plus skew', () => {
    expect(decide(ENDED, NONE, NOW)).toEqual({ action: 'revoke' })
  })

  it('keeps an ACTIVE subscription past the stored date and stores its new period end', () => {
    // Mutation 1: drop the "really ended" check (treat every past-date row as ended) -> red here.
    const answer = readSubscriptions(200, body([{ status: 'ACTIVE', currentPeriodEnd: '2026-11-25T16:29:00Z' }]))
    expect(decide(ENDED, answer, NOW)).toEqual({ action: 'extend', until: '2026-11-25T16:29:00.000Z' })
  })

  it('keeps an ACTIVE subscription with a missing, zone-less or past period end -- never revokes it', () => {
    for (const end of [null, undefined, '2026-11-25T16:29:00', 'soon', '2026-10-01T00:00:00Z']) {
      const answer = readSubscriptions(200, body([{ status: 'ACTIVE', currentPeriodEnd: end }]))
      expect(decide(ENDED, answer, NOW).action, String(end)).toBe('keep')
    }
  })

  it('keeps within the clock-skew margin, and with no stored date', () => {
    expect(decide(ENDED, NONE, new Date(ENDED.getTime() + SKEW_MS))).toEqual({ action: 'keep', reason: 'within_skew' })
    expect(decide(ENDED, NONE, new Date(ENDED.getTime() + SKEW_MS + 1))).toEqual({ action: 'revoke' })
    expect(decide(null, NONE, NOW)).toEqual({ action: 'keep', reason: 'no_date' })
    expect(decide(new Date('nope'), NONE, NOW)).toEqual({ action: 'keep', reason: 'no_date' })
  })
})

describe('fail open: any uncertain answer keeps access', () => {
  it('an HTTP error, a GraphQL error, a malformed body or an unknown status never revokes', () => {
    // Mutation 2: map an unknown answer to revoke (drop the fail-open branch) -> red here.
    const cases: Array<[number, unknown, string]> = [
      [500, null, 'http_500'],
      [401, body([]), 'http_401'],
      [429, body([]), 'http_429'],
      [200, { errors: [{ message: 'Throttled' }], ...body([]) }, 'graphql_error'],
      [200, null, 'graphql_error'],
      [200, { data: {} }, 'malformed'],
      [200, { data: { currentAppInstallation: null } }, 'malformed'],
      [200, body([{ status: 'PENDING' }]), 'no_active_status'],
      [200, body([{ status: 'FROZEN', currentPeriodEnd: '2026-11-25T16:29:00Z' }]), 'no_active_status'],
    ]
    for (const [status, b, reason] of cases) {
      const answer = readSubscriptions(status, b)
      expect(answer, reason).toEqual({ kind: 'unknown', reason })
      expect(decide(ENDED, answer, NOW), reason).toEqual({ action: 'keep', reason })
    }
  })

  it('checkSubscription: a network error, a timeout or a non-JSON body is unknown, never thrown', async () => {
    const boom = (e: Error) => (async () => { throw e }) as unknown as typeof fetch
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    expect(await checkSubscription(boom(new TypeError('fetch failed')), 'a.myshopify.com', 'tok')).toEqual({ kind: 'unknown', reason: 'network_error' })
    expect(await checkSubscription(boom(timeout), 'a.myshopify.com', 'tok')).toEqual({ kind: 'unknown', reason: 'timeout' })
    const html = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    expect(await checkSubscription(html, 'a.myshopify.com', 'tok')).toEqual({ kind: 'unknown', reason: 'graphql_error' })
  })

  it('checkSubscription: asks the shop\'s Admin endpoint with the merchant token and reads an empty list as none', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(JSON.stringify(body([])), { status: 200 })
    }) as unknown as typeof fetch
    expect(await checkSubscription(f, 'a.myshopify.com', 'tok')).toEqual(NONE)
    expect(seen[0].url).toBe('https://a.myshopify.com/admin/api/2026-07/graphql.json')
    expect((seen[0].init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('tok')
    expect(String(seen[0].init.body)).toContain('activeSubscriptions{status currentPeriodEnd}')
  })
})

describe('public-app rows only', () => {
  it('the bridge app (config.app or its shop) is never a candidate', () => {
    // Mutation 3 (pure half): make isPublicApp return true -> red here.
    expect(isPublicApp('fa8a00-11.myshopify.com', null)).toBe(false)
    expect(isPublicApp('FA8A00-11.myshopify.com', {})).toBe(false)
    expect(isPublicApp('other.myshopify.com', { app: 'bcns-data' })).toBe(false)
    expect(isPublicApp('other.myshopify.com', {})).toBe(true)
    expect(isPublicApp('other.myshopify.com', null)).toBe(true)
  })
})
