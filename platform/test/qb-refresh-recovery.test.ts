// QuickBooks refresh recovery: a spent refresh token ends auth_failed + one auth_failed notification,
// a 5xx stays 'error' (row untouched), and a token write that fails after Intuit rotated is retried.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { pool, sql } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { contextFor, refreshOne } from '../worker/src/run.js'
import { alerts, computeHealth } from '../worker/src/health.js'
import { connectors } from '../worker/src/connectors/index.js'

const made: string[] = []
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function mkTick(fetch: typeof globalThis.fetch): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch, stubbed: true,
    now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 24,
  }
}

async function mkQb(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'QB Refresh', 'America/New_York')`, [id, `qr-${id.slice(0, 8)}`])
  await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
             values ($1, 'quickbooks', '1 hour', current_date - 7, '{"realm_id":"123"}'::jsonb, now() + interval '1 day')`, [id])
  await sql(`insert into data.source_tokens (client_id, source, kind, secret, refresh_secret, expires_at)
             values ($1, 'quickbooks', 'quickbooks_oauth_refresh', 'at-old', 'rt-old', now() + interval '5 minutes')`, [id])
  return id
}

const token = async (c: string) => (await sql(
  `select secret, refresh_secret, status, status_detail from data.source_tokens where client_id = $1`, [c])).rows[0]

beforeAll(() => { Object.assign(process.env, { QUICKBOOKS_CLIENT_ID: 'qid', QUICKBOOKS_CLIENT_SECRET: 'qsecret' }) })
afterAll(async () => {
  for (const t of ['notifications', 'connector_health', 'connector_schedule', 'source_tokens'])
    await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
  await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  await Promise.all([pool.end(), closePool()])
})

describe('quickbooks refresh recovery', () => {
  it('invalid_grant ends auth_failed with one auth_failed + client_break notification, however often it ticks', async () => {
    const c = await mkQb()
    const t = mkTick((async () => json({ error: 'invalid_grant', error_description: 'Token invalid' }, 400)) as typeof fetch)
    expect(await refreshOne(await contextFor(t, c, 'quickbooks'), connectors.quickbooks)).toBeNull()
    expect(await token(c)).toMatchObject({ status: 'auth_failed', refresh_secret: 'rt-old' })
    await computeHealth(t); await alerts(t); await alerts(t)
    const n = await sql(`select kind from data.notifications where client_id = $1`, [c])
    expect(n.rows.map(r => r.kind).sort()).toEqual(['auth_failed', 'client_break'])
  })

  it('a 5xx leaves the row active and raises nothing', async () => {
    const c = await mkQb()
    const t = mkTick((async () => json({ fault: 'down' }, 503)) as typeof fetch)
    expect(await refreshOne(await contextFor(t, c, 'quickbooks'), connectors.quickbooks)).toBeNull()
    expect(await token(c)).toMatchObject({ status: 'active', status_detail: null })
    await computeHealth(t); await alerts(t)
    expect((await sql(`select 1 from data.notifications where client_id = $1`, [c])).rowCount).toBe(0)
  })

  it('a token write that fails after Intuit rotated is retried, not stranded', async () => {
    const c = await mkQb()
    const t = mkTick((async () => json({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3600 }, 200)) as typeof fetch)
    // First write (in the tx) dies; the retry on a fresh connection goes through.
    await sql(`create sequence data.qr_seq`) // sequences are non-transactional: the retry sees the bump
    await sql(`create or replace function data.qr_fail_once() returns trigger language plpgsql as $$
               begin
                 if new.secret = 'at-new' and new.client_id = '${c}' and nextval('data.qr_seq') = 1 then
                   raise exception 'qr boom';
                 end if; return new; end $$`)
    await sql(`create trigger qr_fail_once before update on data.source_tokens for each row execute function data.qr_fail_once()`)
    try {
      expect(await refreshOne(await contextFor(t, c, 'quickbooks'), connectors.quickbooks)).toBe('at-new')
    } finally {
      await sql(`drop trigger qr_fail_once on data.source_tokens`)
      await sql(`drop function data.qr_fail_once()`)
      await sql(`drop sequence data.qr_seq`)
    }
    expect(await token(c)).toMatchObject({ secret: 'at-new', refresh_secret: 'rt-new', status: 'active' })
  })
})
