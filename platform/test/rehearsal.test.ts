// Connection-day rehearsal: fixture vendor responses → the real connector fetch path (runOne) → data.raw →
// normalize → canonical → api view, read as a member who signed in through the access-token hook.
// One case per source; a different client's member must see none of it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DB_URL, SUPABASE_URL, USERS, localKeys, pool, rest, serviceClient, signIn, sql, type SeedUser } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { runOne, type ScheduleRow } from '../worker/src/run.js'
import type { Source } from '../worker/src/connectors/index.js'

// The worker's pool and Storage client read these env vars; this file writes rows and objects, so local only.
if (!/127\.0\.0\.1|localhost/.test(DB_URL) || !/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) throw new Error('rehearsal runs against the local stack only')

const fx = (name: string) => JSON.parse(readFileSync(`test/fixtures/${name}-sample.json`, 'utf8'))
const SHOPIFY = fx('shopify'), META = fx('meta'), MONDAY = fx('monday'), MEET = fx('meet'), DRIVE = fx('drive')

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } })
const SHOPIFY_OPS: Record<string, unknown> = { S: SHOPIFY.shop, O: SHOPIFY.orders, P: SHOPIFY.products, Y: SHOPIFY.payouts, I: SHOPIFY.inventory }

// One fixture-serving vendor per source; anything unrouted fails the run with the URL in connector_runs.error.
const ROUTES: Record<Source, (u: URL, body: string) => Response | undefined> = {
  shopify: (_u, body) => { const op = /^query (\w)/.exec(JSON.parse(body).query)?.[1]; return op && op in SHOPIFY_OPS ? json(SHOPIFY_OPS[op]) : undefined },
  meta: (u) => {
    const p = u.pathname
    if (u.hostname === 'example.test') return jpeg()
    if (p.endsWith('/campaigns')) return json(META.campaigns)
    if (p.endsWith('/ads')) return json(META.ads)
    if (p.endsWith('/insights')) return json(u.searchParams.get('level') === 'ad' ? META.ad_insights : META.campaign_insights)
    if (p.endsWith('/adimages')) return json(META.adimages)
    if (/\/act_\d+$/.test(p)) return json(META.account)
  },
  monday: () => json(MONDAY),
  meet: (u) => u.pathname.endsWith('/export') ? new Response(MEET.exports[u.pathname.split('/').at(-2)!]) : u.pathname.endsWith('/files') ? json(MEET.files) : undefined,
  drive: (u) => u.hostname.startsWith('lh3.') ? jpeg() : u.pathname.endsWith('/files') ? json(DRIVE.files) : undefined,
}

const CASES: { source: Source; kind: string; config: object; tables: string[]; views: string[] }[] = [
  { source: 'shopify', kind: 'shopify_admin', config: { shop: 'fixture.myshopify.com' }, tables: ['money', 'products'], views: ['money_v1', 'products_v1'] },
  { source: 'meta', kind: 'meta_system_user', config: { act_id: 'act_1001' }, tables: ['daily_metrics', 'records', 'media'], views: ['campaign_daily_v1'] },
  { source: 'monday', kind: 'monday_personal', config: { board_id: MONDAY.data.boards[0].id, columns: { status: 'status', priority: 'priority', owner: 'person', due: 'date4', link: 'link' } }, tables: ['jobs'], views: ['jobs_v1'] },
  { source: 'meet', kind: 'google_oauth_refresh', config: { folder_id: 'f1' }, tables: ['messages'], views: ['messages_v1'] },
  { source: 'drive', kind: 'google_oauth_refresh', config: { folder_id: 'f1' }, tables: ['media'], views: ['media_v1'] },
]
const CANON = ['customers', 'jobs', 'messages', 'money', 'media', 'products', 'daily_metrics', 'records']

const clientId = randomUUID()
const member = { email: `rehearsal-${clientId.slice(0, 8)}@example.com`, password: randomBytes(12).toString('base64url') }
let memberId = '', memberToken = '', otherToken = ''

beforeAll(async () => {
  process.env.SUPABASE_URL ??= SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= localKeys().service
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Rehearsal', 'America/New_York')`, [clientId, `rh-${clientId.slice(0, 8)}`])
  for (const c of CASES) {
    // Incremental mode (backfill_cursor null); next_run_at in the future so a running worker leaves these alone.
    await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
               values ($1, $2, '1 hour', current_date - 30, $3, now() + interval '1 day')`, [clientId, c.source, c.config])
    await sql(`insert into data.source_tokens (client_id, source, kind, secret) values ($1, $2, $3::data.token_kind, 'test-token')`, [clientId, c.source, c.kind])
  }
  const { data, error } = await serviceClient().auth.admin.createUser({ ...member, email_confirm: true })
  if (error || !data.user) throw new Error(`create member: ${error?.message}`)
  memberId = data.user.id
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'member')`, [memberId, clientId])
  memberToken = (await signIn(member as unknown as SeedUser)).token
  otherToken = (await signIn(USERS.betaMember)).token
})

afterAll(async () => {
  const bucket = serviceClient().storage.from('media')
  for (const folder of ['orig', 'thumb']) {
    const { data } = await bucket.list(`${clientId}/${folder}`, { limit: 1000 })
    const paths = (data ?? []).filter((o) => o.id).map((o) => `${clientId}/${folder}/${o.name}`)
    if (paths.length) await bucket.remove(paths)
  }
  for (const t of [...CANON, 'raw', 'raw_latest']) await sql(`delete from data.${t} where client_id = $1`, [clientId])
  await sql(`delete from data.clients where id = $1`, [clientId])
  if (memberId) await serviceClient().auth.admin.deleteUser(memberId)
  await Promise.all([pool.end(), closePool()])
})

function tick(source: Source): Tick {
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input))
    const r = ROUTES[source](u, String(init?.body ?? '{}'))
    if (!r) throw new Error(`unrouted ${u}`)
    return r
  }) as typeof globalThis.fetch
  return { taskIndex: 0, taskCount: 1, owner: `rehearsal-${randomUUID().slice(0, 8)}`, fetch, stubbed: true,
    now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 1 }
}

const count = async (table: string, source: Source) =>
  Number((await sql(`select count(*) from data.${table} where client_id = $1 and source = $2`, [clientId, source])).rows[0].count)

describe('connection-day rehearsal', () => {
  it.each(CASES)('$source: fixture → runOne → raw → canonical → api view as a member', async ({ source, tables, views }) => {
    const row = (await sql<ScheduleRow>(`select * from data.connector_schedule where client_id = $1 and source = $2`, [clientId, source])).rows[0]
    await runOne(tick(source), row)

    const run = (await sql(`select status, error from data.connector_runs where client_id = $1 and source = $2
      order by started_at desc limit 1`, [clientId, source])).rows[0]
    expect(run).toEqual({ status: 'ok', error: null })
    expect(await count('raw', source)).toBeGreaterThan(0)
    for (const t of tables) expect(await count(t, source), `data.${t}`).toBeGreaterThan(0)

    for (const v of views) {
      const q = `${v}?client_id=eq.${clientId}${v === 'campaign_daily_v1' ? '' : `&source=eq.${source}`}`
      const mine = await rest(q, memberToken)
      expect(mine.status, `${v} as member`).toBe(200)
      expect(mine.body.length, `${v} rows as member`).toBeGreaterThan(0)
      expect(mine.body.every((r: { client_id: string }) => r.client_id === clientId)).toBe(true)
      const theirs = await rest(q, otherToken)
      expect(theirs.status).toBe(200)
      expect(theirs.body, `${v} as another client's member`).toEqual([])
    }
  })
})
