// Meta long-lived token: worker re-exchange inside the 14-day lead, auth_failed on a dead token,
// a response that does not extend the expiry is refused, and a 7-day warning (one deduped client_break) when refresh can't save it.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { pool, sql } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { contextFor, refreshOne } from '../worker/src/run.js'
import { alerts, breakEmail, computeHealth } from '../worker/src/health.js'
import { refreshTokens } from '../worker/src/tokens.js'
import { connectors } from '../worker/src/connectors/index.js'

const made: string[] = []
const D = 864e5
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function mkTick(fetch: typeof globalThis.fetch, calls: { url: string; body: URLSearchParams }[] = [], logs: string[] = []): Tick {
  const wrapped = (async (url: unknown, init?: { body?: string }) => {
    calls.push({ url: String(url), body: new URLSearchParams(init?.body) })
    return fetch(url as string, init as RequestInit)
  }) as typeof globalThis.fetch
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch: wrapped, stubbed: true,
    now: () => new Date(), log: (ev: string, f?: unknown) => { logs.push(`${ev} ${JSON.stringify(f)}`) }, budgetMs: 60_000, claimLimit: 24,
  }
}

/** A meta row whose token dies `days` from now. */
async function mkMeta(days: number, secret = 'tok-old'): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Meta Expiry', 'America/New_York')`, [id, `me-${id.slice(0, 8)}`])
  await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
             values ($1, 'meta', '6 hours', current_date - 7, '{"act_id":"act_1"}'::jsonb, now() + interval '1 day')`, [id])
  // updated_at old: a freshly written row is not retried until an hour after its last write.
  await sql(`insert into data.source_tokens (client_id, source, kind, secret, expires_at, updated_at)
             values ($1, 'meta', 'meta_system_user', $3, now() + $2 * interval '1 day', now() - interval '2 hours')`, [id, days, secret])
  return id
}

const token = async (c: string) => (await sql(
  `select secret, status, expires_at, last_refreshed_at from data.source_tokens where client_id = $1`, [c])).rows[0]
const notices = async (c: string) => (await sql(
  `select kind, dedupe_key, payload from data.notifications where client_id = $1 order by id`, [c])).rows

beforeAll(() => { Object.assign(process.env, { META_CLIENT_ID: 'mid', META_CLIENT_SECRET: 'msecret' }) })
afterAll(async () => {
  for (const t of ['notifications', 'connector_health', 'connector_schedule', 'source_tokens'])
    await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
  await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  await Promise.all([pool.end(), closePool()])
})

describe('meta refresh', () => {
  it('refreshTokens re-exchanges a token inside the lead window and writes secret + expires_at', async () => {
    const c = await mkMeta(10)
    const calls: { url: string; body: URLSearchParams }[] = []
    const t = mkTick((async () => json({ access_token: 'tok-new', token_type: 'bearer', expires_in: 5183944 }, 200)) as typeof fetch, calls)
    await refreshTokens(t)
    const call = calls.find(x => x.body.get('fb_exchange_token') === 'tok-old')
    expect(call?.url).toBe('https://graph.facebook.com/v21.0/oauth/access_token')
    expect(Object.fromEntries(call!.body)).toEqual({
      grant_type: 'fb_exchange_token', client_id: 'mid', client_secret: 'msecret', fb_exchange_token: 'tok-old',
    })
    const row = await token(c)
    expect(row).toMatchObject({ secret: 'tok-new', status: 'active' })
    expect(row.last_refreshed_at).not.toBeNull()
    expect(row.expires_at.getTime() - Date.now()).toBeGreaterThan(59 * D)
  })

  it('a token outside the 14-day lead is left alone', async () => {
    const c = await mkMeta(30)
    const t = mkTick((async () => json({ access_token: 'x', expires_in: 5183944 }, 200)) as typeof fetch)
    await refreshTokens(t)
    expect(await token(c)).toMatchObject({ secret: 'tok-old' })
  })

  it('a dead token (190) ends auth_failed with one auth_failed + client_break, however often it ticks', async () => {
    const c = await mkMeta(3)
    const t = mkTick((async () => json({ error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }, 400)) as typeof fetch)
    expect(await refreshOne(await contextFor(t, c, 'meta'), connectors.meta)).toBeNull()
    expect(await token(c)).toMatchObject({ status: 'auth_failed', secret: 'tok-old' })
    await computeHealth(t); await alerts(t); await alerts(t)
    expect((await notices(c)).map(r => r.kind).sort()).toEqual(['auth_failed', 'client_break'])
  })

  it('a response that does not extend the expiry is refused: row untouched, still active', async () => {
    const c = await mkMeta(3)
    const t = mkTick((async () => json({ access_token: 'tok-same-clock', expires_in: 2 * 86400 }, 200)) as typeof fetch)
    expect(await refreshOne(await contextFor(t, c, 'meta'), connectors.meta)).toBeNull()
    expect(await token(c)).toMatchObject({ secret: 'tok-old', status: 'active', last_refreshed_at: null })
  })

  it('missing app credentials: row untouched, no Graph call', async () => {
    const c = await mkMeta(3)
    const calls: unknown[] = []
    const logs: string[] = []
    const t = mkTick((async () => json({}, 200)) as typeof fetch, calls as never, logs)
    const saved = process.env.META_CLIENT_SECRET
    delete process.env.META_CLIENT_SECRET
    try {
      expect(await refreshOne(await contextFor(t, c, 'meta'), connectors.meta)).toBeNull()
    } finally { process.env.META_CLIENT_SECRET = saved }
    expect(calls).toHaveLength(0)
    expect(logs.join('\n')).toMatch(/token_refresh_failed.*META_CLIENT_ID and META_CLIENT_SECRET/)
    expect(await token(c)).toMatchObject({ secret: 'tok-old', status: 'active' })
  })

  it('a transient failure inside the window is retried hourly, not every tick', async () => {
    const c = await mkMeta(3, 'tok-backoff')
    const calls: { url: string; body: URLSearchParams }[] = []
    const t = mkTick((async () => json({ error: { message: 'temporarily unavailable', code: 2 } }, 500)) as typeof fetch, calls)
    const mine = () => calls.filter(x => x.body.get('fb_exchange_token') === 'tok-backoff').length
    await refreshTokens(t)
    expect(mine()).toBe(1)
    await refreshTokens(t)
    expect(mine()).toBe(1)
    expect(await token(c)).toMatchObject({ secret: 'tok-backoff', status: 'active' })
  })
})

describe('meta expiry warning', () => {
  it('within 7 days and still active: exactly one client_break, deduped across ticks, none outside the window', async () => {
    const near = await mkMeta(5), far = await mkMeta(20)
    const t = mkTick((async () => json({}, 200)) as typeof fetch)
    await alerts(t); await alerts(t)
    const n = await notices(near)
    expect(n).toHaveLength(1)
    expect(n[0].kind).toBe('client_break')
    expect(n[0].dedupe_key).toMatch(new RegExp(`^token_expiring:${near}:meta:\\d+$`))
    expect(n[0].payload).toMatchObject({ source: 'meta', status: 'expiring' })
    expect(await notices(far)).toHaveLength(0)
  })

  it('a refreshed token re-arms the warning under a new key', async () => {
    const c = await mkMeta(5)
    const t = mkTick((async () => json({}, 200)) as typeof fetch)
    await alerts(t)
    await sql(`update data.source_tokens set expires_at = now() + interval '6 days' where client_id = $1`, [c])
    await alerts(t)
    expect(await notices(c)).toHaveLength(2)
  })

  it('email copy names the day it runs out, not a break', () => {
    const m = breakEmail('client_break', 'meta', 'expiring', new Date('2026-12-22T04:18:32Z'))
    expect(m.subject).toBe('Action needed: reconnect Meta Ads by December 21, 2026')
    expect(m.text).toContain('Reconnect by December 21, 2026')
    expect(m.text).not.toContain("can't reach")
  })
})
