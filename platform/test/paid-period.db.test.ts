// P9: Shopify access ends when a paid period ends -- the DB half (migration 20261002000100,
// worker/src/paid-period.ts). Drives the real paidPeriods step with a stubbed Shopify transport
// against synthetic clients/shops, plus the table's tenancy and the hub RPC's guards.
// Needs the local stack; skips with the other DB files when it is down.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { CLIENTS, pool, signIn, sql, USERS } from './helpers.js'
import type { Tick } from '../worker/src/db.js'
import { paidPeriods } from '../worker/src/paid-period.js'

const made: string[] = []
const HOUR = 3_600_000

type Answer = { status: number; body: unknown }
const subs = (s: unknown[]): Answer => ({ status: 200, body: { data: { currentAppInstallation: { activeSubscriptions: s } } } })

/** Transport answering per shop host; records which shops were asked. Any other host fails the test. */
function mkTick(answers: Record<string, Answer>, asked: string[]): Tick {
  const fetchStub = (async (url: string | URL) => {
    const host = new URL(String(url)).host
    asked.push(host)
    const a = answers[host]
    if (!a) return new Response('unexpected', { status: 599 })
    return new Response(JSON.stringify(a.body), { status: a.status })
  }) as unknown as typeof fetch
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch: fetchStub,
    stubbed: true, now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 24,
  }
}

/** A connected public-app (or bridge) shopify client; paidThrough null = no stored date. */
async function mkClient(opts: { paidThrough: Date | null; config?: Record<string, unknown>; shop?: string }) {
  const id = randomUUID()
  made.push(id)
  const shop = opts.shop ?? `pp-${id.slice(0, 8)}.myshopify.com`
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Paid Period Fixture', 'UTC')`, [id, `pp-${id.slice(0, 8)}`])
  await sql(
    `insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
     values ($1, 'shopify', '1 hour', current_date - 7, $2::jsonb, now() + interval '1 day')`,
    [id, JSON.stringify({ shop, ...opts.config })])
  await sql(
    `insert into data.source_tokens (client_id, source, kind, secret, status, updated_at)
     values ($1, 'shopify', 'shopify_admin', 'test-token', 'active', now() - interval '3 days')`, [id])
  if (opts.paidThrough) {
    await sql(`insert into data.shopify_paid_through (client_id, shop, paid_through) values ($1, $2, $3)`, [id, shop, opts.paidThrough])
  }
  return { id, shop }
}

async function state(id: string) {
  const r = await sql<{ token: string; enabled: boolean; paid_through: Date | null; checked_at: Date | null }>(
    `select tk.status token, s.enabled, p.paid_through, p.checked_at
       from data.connector_schedule s
       join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
       left join data.shopify_paid_through p on p.client_id = s.client_id
      where s.client_id = $1 and s.source = 'shopify'`, [id])
  return r.rows[0]
}

afterAll(async () => {
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  await sql(`delete from data.shopify_paid_through where client_id = $1`, [CLIENTS.acme])
})

describe('paidPeriods: the worker step', () => {
  it('a really-ended period (clean empty list, past date) is revoked to the uninstall state', async () => {
    const c = await mkClient({ paidThrough: new Date(Date.now() - 2 * HOUR) })
    const asked: string[] = []
    await paidPeriods(mkTick({ [c.shop]: subs([]) }, asked))
    expect(asked).toContain(c.shop)
    const s = await state(c.id)
    expect(s.token).toBe('revoked')
    expect(s.enabled).toBe(false)
    expect(s.checked_at).not.toBeNull()
  })

  it('an ACTIVE subscription past the stored date keeps access and stores the new end', async () => {
    const c = await mkClient({ paidThrough: new Date(Date.now() - 2 * HOUR) })
    const next = new Date(Date.now() + 30 * 24 * HOUR)
    await paidPeriods(mkTick({ [c.shop]: subs([{ status: 'ACTIVE', currentPeriodEnd: next.toISOString() }]) }, []))
    const s = await state(c.id)
    expect(s.token).toBe('active')
    expect(s.enabled).toBe(true)
    expect(s.paid_through?.toISOString()).toBe(next.toISOString())
  })

  it('a Shopify error never revokes (fail open) and the row waits for the next daily check', async () => {
    const c = await mkClient({ paidThrough: new Date(Date.now() - 2 * HOUR) })
    await paidPeriods(mkTick({ [c.shop]: { status: 500, body: null } }, []))
    const s = await state(c.id)
    expect(s.token).toBe('active')
    expect(s.enabled).toBe(true)
    expect(s.checked_at).not.toBeNull()
    // Checked within 20h: not asked again this tick even though the date is still past.
    const asked: string[] = []
    await paidPeriods(mkTick({ [c.shop]: subs([]) }, asked))
    expect(asked).not.toContain(c.shop)
  })

  it('the bridge app row is never asked about or touched', async () => {
    // Mutation 3 (DB half): remove the isPublicApp filter -> asked + checked_at set -> red.
    const c = await mkClient({ paidThrough: new Date(Date.now() - 2 * HOUR), config: { app: 'bcns-data' } })
    const asked: string[] = []
    await paidPeriods(mkTick({ [c.shop]: subs([]) }, asked))
    expect(asked).not.toContain(c.shop)
    const s = await state(c.id)
    expect(s.token).toBe('active')
    expect(s.enabled).toBe(true)
    expect(s.checked_at).toBeNull()
  })

  it('no stored date (an ACTIVE install, or the store failed) -> never selected; a future date -> not yet', async () => {
    const none = await mkClient({ paidThrough: null })
    const future = await mkClient({ paidThrough: new Date(Date.now() + 2 * HOUR) })
    const asked: string[] = []
    await paidPeriods(mkTick({ [none.shop]: subs([]), [future.shop]: subs([]) }, asked))
    expect(asked).not.toContain(none.shop)
    expect(asked).not.toContain(future.shop)
    expect((await state(none.id)).token).toBe('active')
    expect((await state(future.id)).token).toBe('active')
  })
})

describe('data.shopify_paid_through tenancy', () => {
  it('no tenant can read the table, not even its own row (forbidden read)', async () => {
    // Mutation 5: grant select to authenticated + a permissive policy -> beta sees acme's row -> red.
    await sql(
      `insert into data.shopify_paid_through (client_id, shop, paid_through) values ($1, 'acme-pp.myshopify.com', now() + interval '1 day')
       on conflict (client_id) do update set paid_through = excluded.paid_through`, [CLIENTS.acme])
    const c = await pool.connect()
    let seen: number | 'denied'
    try {
      await c.query('begin')
      await c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: USERS.betaMember.id, role: 'authenticated', client_id: CLIENTS.beta })])
      await c.query('set local role authenticated')
      try {
        const r = await c.query(`select count(*)::int n from data.shopify_paid_through where client_id = $1`, [CLIENTS.acme])
        seen = r.rows[0].n
      } catch (e) {
        expect((e as { code?: string }).code).toBe('42501')
        seen = 'denied'
      }
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
    }
    expect(seen === 'denied' || seen === 0).toBe(true)
  })
})

describe('api.record_shopify_paid_through (hub /finish)', () => {
  it('the owner stores a date for their own tenant; a member is forbidden; a date over 400 days is refused', async () => {
    const until = new Date(Date.now() + 20 * 24 * HOUR).toISOString()
    const owner = await signIn(USERS.acmeOwner)
    expect((await owner.client.rpc('record_shopify_paid_through', { p_shop: 'acme-pp.myshopify.com', p_until: until })).error).toBeNull()
    const r = await sql<{ paid_through: Date; checked_at: Date | null }>(`select paid_through, checked_at from data.shopify_paid_through where client_id = $1`, [CLIENTS.acme])
    expect(r.rows[0].paid_through.toISOString()).toBe(until)
    expect(r.rows[0].checked_at).toBeNull()

    const member = await signIn(USERS.acmeMember)
    expect((await member.client.rpc('record_shopify_paid_through', { p_shop: 'acme-pp.myshopify.com', p_until: until })).error?.code).toBe('BCNS2')
    const far = new Date(Date.now() + 401 * 24 * HOUR).toISOString()
    expect((await owner.client.rpc('record_shopify_paid_through', { p_shop: 'acme-pp.myshopify.com', p_until: far })).error?.code).toBe('BCNS3')
    expect((await owner.client.rpc('record_shopify_paid_through', { p_shop: 'not a shop', p_until: until })).error?.code).toBe('BCNS3')
  })
})
