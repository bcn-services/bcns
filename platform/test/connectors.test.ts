// §4 connector contract: raw dedupe, tombstones, normalize idempotency, money/metric split.
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pool, sql } from './helpers.js'
import { closePool, tx, type Tick } from '../worker/src/db.js'
import { applyWrites, runOne, writeRaw, type ScheduleRow } from '../worker/src/run.js'
import { connectors, type RawRow, type RunContext, type Source } from '../worker/src/connectors/index.js'

const fx = (name: string) => JSON.parse(readFileSync(`test/fixtures/${name}-sample.json`, 'utf8'))
const SHOPIFY = fx('shopify'), META = fx('meta'), MONDAY = fx('monday'), MEET = fx('meet'), DRIVE = fx('drive')

const KIND: Record<Source, string> = {
  shopify: 'shopify_admin', meta: 'meta_system_user', monday: 'monday_personal', meet: 'google_oauth_refresh', drive: 'google_oauth_refresh',
  quickbooks: 'quickbooks_oauth_refresh',
}
const CANON = ['customers', 'jobs', 'messages', 'money', 'media', 'products', 'daily_metrics', 'records']
const made: string[] = []

async function mkClient(sources: { source: Source; config: unknown }[]): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Fixture', 'America/New_York')`,
    [id, `fx-${id.slice(0, 8)}`])
  for (const s of sources) {
    await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
               values ($1, $2, '1 hour', current_date - 7, $3::jsonb, now() + interval '1 day')`,
      [id, s.source, JSON.stringify(s.config)])
    await sql(`insert into data.source_tokens (client_id, source, kind, secret) values ($1, $2, $3::data.token_kind, 'test-token')`,
      [id, s.source, KIND[s.source]])
  }
  return id
}

afterAll(async () => {
  if (made.length) {
    for (const t of [...CANON, 'raw', 'raw_latest']) await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
    await sql(`delete from data.worker_leases where name like 'renormalize:%'`)
    await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  }
  await Promise.all([pool.end(), closePool()])
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function mkTick(fetch: typeof globalThis.fetch, budgetMs = 60_000): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch, stubbed: true,
    now: () => new Date(), log: () => {}, budgetMs, claimLimit: 4,
  }
}

const scheduleRow = async (clientId: string, source: Source): Promise<ScheduleRow> =>
  (await sql<ScheduleRow>(`select * from data.connector_schedule where client_id = $1 and source = $2`, [clientId, source])).rows[0]

// ---------------------------------------------------------------- fixture -> raw rows

const board = MONDAY.data.boards[0]
const mondayRaw = (items: unknown[]): RawRow[] => [
  { entity: 'board', externalId: String(board.id), payload: { id: board.id, name: board.name, columns: board.columns, groups: board.groups } },
  ...items.map((it: any) => ({ entity: 'item', externalId: String(it.id), sourceUpdatedAt: new Date(it.updated_at), payload: it })),
]

const shopifyRaw = (): RawRow[] => {
  const units = SHOPIFY.inventory.data.products.nodes
    .flatMap((p: any) => p.variants.nodes).reduce((s: number, v: any) => s + v.inventoryQuantity, 0)
  return [
    ...SHOPIFY.orders.data.orders.nodes.map((n: any) => ({ entity: 'order', externalId: n.id, payload: n })),
    ...SHOPIFY.products.data.products.nodes.map((n: any) => ({ entity: 'product', externalId: n.id, payload: n })),
    ...SHOPIFY.payouts.data.shopifyPaymentsAccount.payouts.nodes.map((n: any) => ({ entity: 'payout', externalId: n.id, payload: n })),
    { entity: 'inventory_snapshot', externalId: '2026-09-10', payload: { day: '2026-09-10', units } },
  ]
}

const metaRaw = (): RawRow[] => [
  ...META.campaigns.data.map((n: any) => ({ entity: 'campaign', externalId: n.id, payload: n })),
  ...META.ads.data.map((n: any) => ({ entity: 'ad', externalId: n.id, payload: n })),
  ...META.campaign_insights.data.map((n: any) => ({ entity: 'insight_campaign_day', externalId: `${n.campaign_id}:${n.date_start}`, payload: n })),
  ...META.ad_insights.data.map((n: any) => ({ entity: 'insight_ad_day', externalId: `${n.ad_id}:${n.date_start}`, payload: n })),
  // shaped as the connector stores it: the download already happened, so normalize stays pure.
  ...META.adimages.data.map((n: any, i: number) => ({
    entity: 'adimage', externalId: n.hash,
    payload: { ...n, storage_path: `orig/${n.hash}.jpg`, bytes: 1024 + i, creative_name: `Creative ${i + 1}` },
  })),
]

const meetRaw = (): RawRow[] => MEET.files.files.map((f: any) => ({
  entity: 'doc', externalId: f.id, sourceUpdatedAt: new Date(f.modifiedTime), payload: { ...f, text: MEET.exports[f.id] },
}))

// shaped as the connector stores it: the thumbnail copy already happened, so normalize stays pure.
const driveRaw = (): RawRow[] => DRIVE.files.files.map((f: any) => ({
  entity: 'file', externalId: f.id, sourceUpdatedAt: new Date(f.modifiedTime),
  payload: { ...f, thumb_path: f.thumbnailLink ? `thumb/${f.id}.jpg` : null },
}))

const ctxFor = (clientId: string, source: Source, config: unknown): RunContext =>
  ({ clientId, source, config, timezone: 'America/New_York', token: { secret: 'test-token' } }) as unknown as RunContext

describe('connectors', () => {
  it('raw_dedupe', async () => {
    const c = await mkClient([{ source: 'monday', config: { board_id: board.id } }])
    const page = mondayRaw(board.items_page.items)
    await tx(cc => writeRaw(cc, c, 'monday', page, null))
    await tx(cc => writeRaw(cc, c, 'monday', page, null))

    const count = async (t: string) =>
      Number((await sql<{ n: string }>(`select count(*) n from data.${t} where client_id = $1`, [c])).rows[0].n)
    expect(await count('raw')).toBe(26)
    expect(await count('raw_latest')).toBe(26)

    const before = (await sql<{ payload_hash: string }>(
      `select payload_hash from data.raw_latest where client_id = $1 and entity = 'item' and external_id = $2`,
      [c, String(board.items_page.items[0].id)])).rows[0].payload_hash

    const edited = structuredClone(page)
    edited[1].payload.name = `${edited[1].payload.name}!`
    await tx(cc => writeRaw(cc, c, 'monday', edited, null))

    expect(await count('raw')).toBe(27)
    expect(await count('raw_latest')).toBe(26)
    const after = (await sql<{ payload_hash: string }>(
      `select payload_hash from data.raw_latest where client_id = $1 and entity = 'item' and external_id = $2`,
      [c, String(board.items_page.items[0].id)])).rows[0].payload_hash
    expect(after).not.toBe(before)
  })

  it('tombstone_only_on_done', async () => {
    const c = await mkClient([{ source: 'monday', config: { board_id: board.id, done_statuses: ['Done'] } }])
    const items = board.items_page.items
    const serve = (n: number, cursor: string | null) => {
      const fetch = (async (url: string) => url.includes('api.monday.com')
        ? json({ data: { boards: [{ ...board, items_page: { cursor, items: items.slice(0, n) } }] } })
        : json({})) as unknown as typeof globalThis.fetch
      return fetch
    }
    const tombstoned = async () => Number((await sql<{ n: string }>(
      `select count(*) n from data.jobs where client_id = $1 and deleted_at is not null`, [c])).rows[0].n)

    await runOne(mkTick(serve(25, null)), await scheduleRow(c, 'monday'))
    expect(Number((await sql<{ n: string }>(`select count(*) n from data.jobs where client_id = $1`, [c])).rows[0].n)).toBe(25)
    expect(await tombstoned()).toBe(0)

    // budget stop: the page reports done:false, so nothing may be tombstoned.
    await runOne(mkTick(serve(20, 'more'), 0), await scheduleRow(c, 'monday'))
    expect(await tombstoned()).toBe(0)

    await runOne(mkTick(serve(20, null)), await scheduleRow(c, 'monday'))
    expect(await tombstoned()).toBe(5)

    await runOne(mkTick(serve(25, null)), await scheduleRow(c, 'monday'))
    expect(await tombstoned()).toBe(0)
  })

  it('drive_thumb_once', async () => {
    async function run(known: Set<string>) {
      const clientId = randomUUID()
      const fetchedUrls: string[] = []
      const fetch = (async (url: string) => {
        const u = String(url)
        fetchedUrls.push(u)
        if (u.includes('/drive/v3/files')) return json({ files: DRIVE.files.files })
        if (u.includes('img1')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })
        if (u.includes('deck1')) return new Response('boom', { status: 500 })
        return json({})
      }) as unknown as typeof globalThis.fetch
      const putCalls: [string, string][] = []
      const logCalls: [string, unknown][] = []
      const ctx = ({
        clientId, source: 'drive' as Source, config: { folder_id: 'f1' }, timezone: 'America/New_York',
        token: { secret: 'test-token' },
        fetch,
        log: (event: string, data?: unknown) => logCalls.push([event, data]),
        putObject: async (path: string, _bytes: Uint8Array, mime: string) => { putCalls.push([path, mime]) },
        knownMedia: async () => known,
      }) as unknown as RunContext
      const pages = []
      for await (const page of connectors.drive.backfill(ctx, new Date(0), null)) pages.push(page)
      return { pages, putCalls, logCalls, fetchedUrls, clientId }
    }

    const { pages, putCalls, logCalls, fetchedUrls, clientId } = await run(new Set(['pdf1']))
    expect(pages.length).toBe(1)
    const [page] = pages
    expect(page.done).toBe(true)
    expect(page.entityDone).toBe(true)
    expect(typeof page.cursor.pulled_at).toBe('string')
    expect(page.raw.length).toBe(3)
    expect(page.raw.every(r => r.entity === 'file')).toBe(true)

    expect(putCalls).toEqual([[`${clientId}/thumb/img1.jpg`, 'image/png']])
    const byId = Object.fromEntries(page.raw.map(r => [r.externalId, r.payload]))
    expect(byId.img1.thumb_path).toBe(`${clientId}/thumb/img1.jpg`)
    expect(byId.pdf1.thumb_path).toBeNull()
    expect(byId.deck1.thumb_path).toBeNull()
    expect(logCalls.filter(([e]) => e === 'drive_thumb_skip')).toEqual([['drive_thumb_skip', { id: 'deck1', error: expect.any(String) }]])
    const thumbUrl = fetchedUrls.find(u => u.includes('img1'))
    expect(thumbUrl).toMatch(/=s512$/)

    const known = await run(new Set(['img1']))
    expect(known.putCalls.find(([path]) => path.includes('img1.jpg'))).toBeUndefined()
  })

  it('normalize_idempotent', async () => {
    const c = await mkClient([
      { source: 'shopify', config: { shop: 'fixture.myshopify.com', currency: 'USD' } },
      { source: 'meta', config: { act_id: 'act_1001', currency: 'USD' } },
      { source: 'monday', config: { board_id: board.id, columns: { status: 'status', priority: 'priority', owner: 'person', due: 'date4', link: 'link' } } },
      { source: 'meet', config: { folder_id: 'f1' } },
      { source: 'drive', config: { folder_id: 'f1' } },
    ])
    const cases: [Source, RawRow[], unknown][] = [
      ['shopify', shopifyRaw(), { shop: 'fixture.myshopify.com', currency: 'USD' }],
      ['meta', metaRaw(), { act_id: 'act_1001', currency: 'USD' }],
      ['monday', mondayRaw(board.items_page.items), { board_id: board.id, columns: { status: 'status', priority: 'priority', owner: 'person', due: 'date4', link: 'link' }, done_statuses: ['Done'] }],
      ['meet', meetRaw(), { folder_id: 'f1' }],
      ['drive', driveRaw(), { folder_id: 'f1' }],
    ]
    for (const [source, raw, config] of cases) {
      const writes = connectors[source].normalize(ctxFor(c, source, config), raw)
      const first = await tx(cc => applyWrites(cc, c, source, writes))
      expect(first, source).toBeGreaterThan(0)
      const second = await tx(cc => applyWrites(cc, c, source, writes))
      expect(second, source).toBe(0)
    }
  })

  it('money_metric_disjoint', async () => {
    const bad = await sql(`select 1 from data.daily_metrics where metric in ('revenue','orders','refunds','payouts')`)
    expect(bad.rowCount).toBe(0)
    const kinds = await sql(`select 1 from data.money where kind not in ('order','refund','payout')`)
    expect(kinds.rowCount).toBe(0)
  })

  // §4.5 is provisional: the note title suffix and attendee block are unverified (Needs Nate N3).
  it.todo('parseNotes')
})
