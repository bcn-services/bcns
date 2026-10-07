// Client break emails: pure decision layer (no DB, runs locally). DB-backed cases live in worker.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { breakEmail, clientBreakNotices, ownerRecipients, sendClientEmail, type BreakRow } from '../worker/src/health.js'
import type { Tick } from '../worker/src/db.js'

const T0 = new Date('2026-10-01T12:00:00.000Z')
const H = 3600_000, D = 24 * H, MIN = 60_000
const row = (o: Partial<BreakRow> = {}): BreakRow =>
  ({ client_id: 'c1', source: 'drive', status: 'auth_failed', status_since: T0, initial_sent_at: null, ...o })
const at = (ms: number) => new Date(T0.getTime() + ms)

describe('clientBreakNotices', () => {
  it('auth_failed is immediate, with a key literal-pinned to status_since', () => {
    const n = clientBreakNotices([row()], at(1000))
    expect(n).toHaveLength(1)
    expect(n[0].kind).toBe('client_break')
    expect(n[0].dedupe_key).toBe('client_break:c1:drive:2026-10-01T12:00:00.000Z')
    expect(n[0].payload).toEqual({ source: 'drive', status: 'auth_failed', status_since: '2026-10-01T12:00:00.000Z' })
  })

  it('the same breakage at two different clocks yields an identical key; a new status_since a new key', () => {
    const a = clientBreakNotices([row()], at(1 * H))[0].dedupe_key
    const b = clientBreakNotices([row()], at(2 * D))[0].dedupe_key
    expect(a).toBe(b)
    expect(clientBreakNotices([row({ status_since: at(5 * D) })], at(6 * D))[0].dedupe_key).not.toBe(a)
  })

  it('stale waits out the 6h grace', () => {
    const r = row({ status: 'stale' })
    expect(clientBreakNotices([r], at(6 * H - MIN))).toEqual([])
    expect(clientBreakNotices([r], at(6 * H + MIN)).map(n => n.kind)).toEqual(['client_break'])
  })

  it('ok / error / never_ran raise nothing, even with a prior email', () => {
    for (const status of ['ok', 'error', 'never_ran'])
      expect(clientBreakNotices([row({ status, initial_sent_at: at(-10 * D) })], at(1 * D))).toEqual([])
  })

  it('reminder: absent with no sent initial (unsent / no-owner), absent at 3d-1min, present at 3d+1min, own stable key', () => {
    expect(clientBreakNotices([row()], at(30 * D)).map(n => n.kind)).toEqual(['client_break'])
    const init = at(0)
    expect(clientBreakNotices([row({ initial_sent_at: init })], at(3 * D - MIN)).map(n => n.kind)).toEqual(['client_break'])
    const due = clientBreakNotices([row({ initial_sent_at: init })], at(3 * D + MIN))
    expect(due.map(n => n.kind)).toEqual(['client_break', 'client_break_reminder'])
    expect(due[1].dedupe_key).toBe('client_break_reminder:c1:drive:2026-10-01T12:00:00.000Z')
  })

  it('two ticks over one breakage insert one client_break row (in-memory dedupe_key store)', () => {
    const store = new Map<string, unknown>()
    for (const now of [at(1 * H), at(2 * H)])
      for (const n of clientBreakNotices([row()], now)) if (!store.has(n.dedupe_key)) store.set(n.dedupe_key, n)
    expect(store.size).toBe(1)
  })
})

describe('ownerRecipients', () => {
  it('keeps owner, non-smoke, non-empty, deduped only', () => {
    expect(ownerRecipients([
      { email: 'o@example.com', role: 'owner', is_smoke: false },
      { email: 'o@example.com', role: 'owner', is_smoke: false },
      { email: 'm@example.com', role: 'member', is_smoke: false },
      { email: 's@example.com', role: 'owner', is_smoke: true },
      { email: '', role: 'owner', is_smoke: false },
      { email: null, role: 'owner', is_smoke: false },
    ])).toEqual(['o@example.com'])
  })
})

describe('breakEmail', () => {
  const JARGON = /\b(mcp|oauth|sync|cursor|token|auth_failed|stale|api)\b/i
  const cases: [Parameters<typeof breakEmail>[0], string, string][] = [
    ['client_break', 'drive', 'auth_failed'], ['client_break', 'meta', 'stale'],
    ['client_break_reminder', 'shopify', 'auth_failed'], ['client_break_reminder', 'quickbooks', 'stale'],
  ]
  it.each(cases)('%s %s %s: hub link, Reconnect <Label>, no jargon', (kind, source, status) => {
    const { subject, text } = breakEmail(kind, source, status, T0)
    const label = { drive: 'Google Drive', meta: 'Meta Ads', shopify: 'Shopify', quickbooks: 'QuickBooks' }[source]!
    expect(text).toContain(`Reconnect ${label}: https://connect.bcn-services.com/`)
    expect(`${subject}\n${text}`).not.toMatch(JARGON)
  })
  it('says what happened and when, and reminders say still not connected', () => {
    expect(breakEmail('client_break', 'drive', 'auth_failed', T0).text).toContain("can't reach your Google Drive account")
    expect(breakEmail('client_break', 'drive', 'stale', T0).text).toContain('hasn\'t updated since October 1, 2026')
    expect(breakEmail('client_break', 'drive', 'stale', T0).text).toContain("If it doesn't, we've been alerted too.")
    for (const [kind, status] of [['client_break', 'stale'], ['client_break', 'auth_failed'], ['client_break_reminder', 'stale'], ['client_break_reminder', 'auth_failed']] as const)
      expect(breakEmail(kind, 'drive', status, T0).text.toLowerCase()).not.toContain('reply')
    expect(breakEmail('client_break_reminder', 'drive', 'auth_failed', T0).text).toContain('still not connected')
  })
})

describe('sendClientEmail', () => {
  const ENV = ['RESEND_API_KEY', 'BCNS_ALERT_FROM', 'BCNS_ALERT_EMAIL', 'BCNS_CLIENT_REPLY_TO']
  const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]))
  afterEach(() => { for (const k of ENV) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]) })
  const send = async (to: string[]) => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = []
    const fetch = (async (url: any, init?: any) => {
      calls.push({ url: String(url), headers: init?.headers ?? {}, body: String(init?.body ?? '') })
      return new Response('{}', { status: 200 })
    }) as typeof globalThis.fetch
    await sendClientEmail({ fetch } as Tick, to, 'Subj', 'Body', 'k1')
    return { call: calls[0], msgs: JSON.parse(calls[0].body) as Record<string, unknown>[] }
  }

  it('one batch message per owner, reply_to from BCNS_CLIENT_REPLY_TO only, Idempotency-Key set', async () => {
    process.env.RESEND_API_KEY = 'rk'
    process.env.BCNS_ALERT_FROM = 'bot@example.test'
    process.env.BCNS_ALERT_EMAIL = 'alerts@example.test'
    process.env.BCNS_CLIENT_REPLY_TO = 'people@example.test'
    const { call, msgs } = await send(['a@example.com', 'b@example.com'])
    expect(call.url).toBe('https://api.resend.com/emails/batch')
    expect(call.headers['Idempotency-Key']).toBe('k1')
    expect(msgs.map(m => m.to)).toEqual([['a@example.com'], ['b@example.com']])
    for (const m of msgs) expect(m).toMatchObject({ from: 'bot@example.test', reply_to: 'people@example.test', subject: 'Subj', text: 'Body' })
  })

  it('only BCNS_ALERT_EMAIL set: no reply_to key at all (never the alerts inbox)', async () => {
    process.env.RESEND_API_KEY = 'rk'
    process.env.BCNS_ALERT_FROM = 'bot@example.test'
    process.env.BCNS_ALERT_EMAIL = 'alerts@example.test'
    delete process.env.BCNS_CLIENT_REPLY_TO
    expect('reply_to' in (await send(['a@example.com'])).msgs[0]).toBe(false)
  })
})
