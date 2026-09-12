// §5 worker steps: partitions, claim sharding, leases, tokens, health, alerts, renormalize.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CLIENTS, localKeys, pool, sql, SUPABASE_URL } from './helpers.js'
import { closePool, type Tick } from '../worker/src/db.js'
import { claim } from '../worker/src/run.js'
import { tick, type TickResult } from '../worker/src/tick.js'
import { refreshTokens } from '../worker/src/tokens.js'
import { alerts, computeHealth } from '../worker/src/health.js'
import { renormalize } from '../worker/src/renormalize.js'
import type { Source } from '../worker/src/connectors/index.js'

const KIND: Record<Source, string> = {
  shopify: 'shopify_admin', meta: 'meta_system_user', monday: 'monday_personal', meet: 'google_oauth_refresh',
}
const CANON = ['customers', 'jobs', 'messages', 'money', 'media', 'products', 'daily_metrics', 'records']
const SEEDED = [CLIENTS.acme, CLIENTS.beta, CLIENTS.gamma]
const made: string[] = []

let schedules: Record<string, unknown>[] = []
let tokens: Record<string, unknown>[] = []
let acmeMoney: Record<string, any>[] = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Stubbed transports never reach a real API; anything unrouted answers an empty 200. */
function stub(route: (url: string, body: string) => unknown): typeof globalThis.fetch {
  return (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input)
    const r = route(url, String(init?.body ?? ''))
    return r instanceof Response ? r : json(r ?? {})
  }) as typeof globalThis.fetch
}

const emptyShopify = (q: string) =>
  /shop\{currencyCode/.test(q) ? { data: { shop: {} } }
  : /shopifyPaymentsAccount/.test(q) ? { data: { shopifyPaymentsAccount: null } }
  : /orders\(first:/.test(q) ? { data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }
  : /products\(first:/.test(q) ? { data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }
  : { data: {} }

const emptyBoard = { data: { boards: [{ id: '1001', name: 'Board 1', columns: [], groups: [], items_page: { cursor: null, items: [] } }] } }

const idleFetch = stub((url, body) =>
  url.includes('myshopify.com') ? emptyShopify(body)
  : url.includes('api.monday.com') ? emptyBoard
  : url.includes('graph.facebook.com') ? { data: [], paging: {} }
  : {})

function mkTick(fetch: typeof globalThis.fetch = idleFetch): Tick {
  return {
    taskIndex: 0, taskCount: 1, owner: `test-${randomUUID().slice(0, 8)}`, fetch, stubbed: true,
    now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 24,
  }
}

async function mkClient(sources: { source: Source; config?: unknown }[], id: string = randomUUID()): Promise<string> {
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Worker Fixture', 'America/New_York')`,
    [id, `wk-${id.slice(0, 8)}`])
  for (const s of sources) {
    await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
               values ($1, $2, '1 hour', current_date - 7, $3::jsonb, now() + interval '1 day')`,
      [id, s.source, JSON.stringify(s.config ?? (s.source === 'shopify' ? { shop: `wk-${id.slice(0, 8)}.myshopify.com` } : s.source === 'monday' ? { board_id: '1001' } : s.source === 'meta' ? { act_id: 'act_1' } : { folder_id: 'f1' }))])
    await sql(`insert into data.source_tokens (client_id, source, kind, secret) values ($1, $2, $3::data.token_kind, 'test-token')`,
      [id, s.source, KIND[s.source]])
  }
  return id
}

const due = (clientId: string, source?: Source) =>
  sql(`update data.connector_schedule set next_run_at = now() where client_id = $1 and ($2::data.source is null or source = $2)`, [clientId, source ?? null])

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = localKeys().service
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.BCNS_ALERT_EMAIL = 'alerts@example.test'
  schedules = (await sql(`select to_jsonb(s) j from data.connector_schedule s where client_id = any($1::uuid[])`, [SEEDED])).rows.map(r => r.j)
  tokens = (await sql(`select to_jsonb(t) j from data.source_tokens t where client_id = any($1::uuid[])`, [SEEDED])).rows.map(r => r.j)
  acmeMoney = (await sql(`select to_jsonb(m) j from data.money m where client_id = $1 and external_id = any($2::text[])`,
    [CLIENTS.acme, ['order-0', 'order-1', 'order-2']])).rows.map(r => r.j)
  // Keep every seeded row out of the ticks these tests drive; restored in afterAll.
  await sql(`update data.connector_schedule set next_run_at = now() + interval '1 day' where client_id = any($1::uuid[])`, [SEEDED])
})

afterAll(async () => {
  if (made.length) {
    for (const t of [...CANON, 'raw', 'raw_latest']) await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
    await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  }
  for (const t of ['raw', 'raw_latest', 'connector_runs', 'egress_ledger']) {
    await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [SEEDED])
  }
  await sql(`delete from data.daily_metrics where client_id = any($1::uuid[]) and metric = 'inventory_units'`, [SEEDED])
  await sql(`delete from data.notifications`)
  await sql(`delete from data.worker_leases where name <> 'housekeeping'`)
  await sql(`update data.worker_leases set lease_until = 'epoch', owner = 'seed' where name = 'housekeeping'`)
  await sql(`update data.clients set timezone = 'America/New_York' where id = $1`, [CLIENTS.acme])
  for (const m of acmeMoney) {
    await sql(`update data.money set kind = $3, occurred_at = $4, day = $5, amount_minor = $6, currency = $7,
                 status = $8, order_number = $9, customer_external_id = $10, items_count = $11, url = $12,
                 attributes = $13::jsonb, source_updated_at = $14
               where client_id = $1 and external_id = $2 and source = 'shopify'`,
      [CLIENTS.acme, m.external_id, m.kind, m.occurred_at, m.day, m.amount_minor, m.currency, m.status,
        m.order_number, m.customer_external_id, m.items_count, m.url, JSON.stringify(m.attributes), m.source_updated_at])
  }
  for (const s of schedules) {
    await sql(`update data.connector_schedule set enabled = $3, interval = $4::interval, backfill_cursor = $5::jsonb,
                 incremental_cursor = $6::jsonb, renormalize_cursor = null, renormalize_requested_at = null,
                 config = $7::jsonb, next_run_at = $8, lease_until = null, lease_owner = null,
                 last_run_at = $9, last_success_at = $10, last_error = null, last_error_at = null, consecutive_failures = 0
               where client_id = $1 and source = $2`,
      [s.client_id, s.source, s.enabled, s.interval, s.backfill_cursor && JSON.stringify(s.backfill_cursor),
        JSON.stringify(s.incremental_cursor), JSON.stringify(s.config), s.next_run_at, s.last_run_at, s.last_success_at])
  }
  for (const t of tokens) {
    await sql(`update data.source_tokens set kind = $3::data.token_kind, secret = $4, refresh_secret = $5,
                 expires_at = $6, status = $7::data.token_status, status_detail = null, attributes = $8::jsonb
               where client_id = $1 and source = $2`,
      [t.client_id, t.source, t.kind, t.secret, t.refresh_secret, t.expires_at, t.status, JSON.stringify(t.attributes)])
  }
  await sql(`update data.connector_health set status = 'never_ran', status_since = now(), last_run_at = null,
             last_success_at = null, last_error = null where client_id = any($1::uuid[])`, [SEEDED])
  await Promise.all([pool.end(), closePool()])
})

describe('worker', () => {
  it('raw_partitioned', async () => {
    const parent = await sql<{ relkind: string; k: string }>(
      `select c.relkind, pg_get_partkeydef(c.oid) k from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'data' and c.relname = 'raw'`)
    expect(parent.rows[0].relkind).toBe('p')
    expect(parent.rows[0].k).toBe('RANGE (fetched_at)')

    // Two connections at once: the advisory xact lock inside the function serialises them.
    const [a, b] = [await pool.connect(), await pool.connect()]
    try {
      await Promise.all([a.query('select data.ensure_raw_partitions()'), b.query('select data.ensure_raw_partitions()')])
    } finally { a.release(); b.release() }

    const m2 = await sql(`select 1 from pg_tables where schemaname = 'data'
      and tablename = 'raw_' || to_char(date_trunc('month', now()) + interval '2 months', 'YYYY_MM')`)
    expect(m2.rowCount).toBe(1)
    const def = await sql(`select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
      where i.inhparent = 'data.raw'::regclass and pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'`)
    expect(def.rowCount).toBe(0)
  })

  it('stale_no_false_alarm', async () => {
    const c = await mkClient([{ source: 'shopify' }, { source: 'monday' }])
    for (const source of ['shopify', 'monday'] as const) {
      for (let i = 0; i < 11; i++) {
        await sql(`insert into data.connector_runs (client_id, source, mode, status, started_at, finished_at, rows_fetched)
                   values ($1, $2, 'incremental', 'ok', now() - make_interval(mins => $3), now() - make_interval(mins => $3), $4)`,
          [c, source, 60 - i * 5, i === 10 ? 0 : 100])
      }
    }
    await sql(`update data.connector_schedule set last_run_at = now(), last_success_at = now() where client_id = $1`, [c])
    await computeHealth(mkTick())
    const h = await sql<{ source: string; status: string }>(
      `select source, status from data.connector_health where client_id = $1`, [c])
    const by = Object.fromEntries(h.rows.map(r => [r.source, r.status]))
    expect(by.shopify).toBe('ok')     // updated_at-filtered incremental: an idle store is not stale
    expect(by.monday).toBe('stale')   // full-list source: 0 rows after 10 positive runs
  })

  it('alert_retry', async () => {
    const c = await mkClient([{ source: 'monday' }])
    await sql(`update data.source_tokens set status = 'auth_failed' where client_id = $1`, [c])
    await sql(`insert into data.connector_health (client_id, source, status, status_since)
               values ($1, 'monday', 'auth_failed', date_trunc('second', now()))
               on conflict (client_id, source) do update set status = 'auth_failed'`, [c])
    const key = await sql<{ dedupe_key: string }>(
      `select 'auth_failed:' || client_id || ':' || source || ':' || status_since as dedupe_key
       from data.connector_health where client_id = $1`, [c])
    const dedupe = key.rows[0].dedupe_key
    const one = async () => (await sql<{ sent_at: Date | null; attempts: number; n: string }>(
      `select sent_at, attempts, count(*) over () n from data.notifications where dedupe_key = $1`, [dedupe])).rows

    await alerts(mkTick(stub(() => json({ message: 'resend down' }, 500))))
    expect(one()).resolves
    let rows = await one()
    expect(rows.length).toBe(1)
    expect(rows[0].sent_at).toBeNull()
    expect(rows[0].attempts).toBe(1)

    await alerts(mkTick(stub(() => ({ id: 'msg_1' }))))
    rows = await one()
    expect(rows[0].sent_at).not.toBeNull()

    await alerts(mkTick(stub(() => ({ id: 'msg_2' }))))
    expect((await one()).length).toBe(1)
  })

  it('worker_claim_no_double_process', async () => {
    const pick = async (shard: number, n: number) => (await sql<{ id: string }>(
      `select id from (select gen_random_uuid() as id from generate_series(1, 2000)) x
       where ((hashtext(id::text) % 2) + 2) % 2 = $1 limit $2`, [shard, n])).rows.map(r => r.id)
    const ids = [...await pick(0, 3), ...await pick(1, 2)]
    for (const id of ids) await mkClient([{ source: 'shopify' }, { source: 'monday' }], id)
    await sql(`update data.connector_schedule set next_run_at = now() where client_id = any($1::uuid[])`, [ids])

    const opts = { fetch: idleFetch, taskCount: 2, claimLimit: 24, log: () => {} }
    const [t0, t1] = await Promise.all([tick({ ...opts, taskIndex: 0 }), tick({ ...opts, taskIndex: 1 })])

    const runs = await sql<{ client_id: string; source: string; lease_owner: string }>(
      `select client_id, source, lease_owner from data.connector_runs where client_id = any($1::uuid[])`, [ids])
    expect(runs.rows.length).toBe(10)
    expect(new Set(runs.rows.map(r => `${r.client_id}:${r.source}`)).size).toBe(10)

    const owned = (o: string) => new Set(runs.rows.filter(r => r.lease_owner === o).map(r => `${r.client_id}:${r.source}`))
    const a = owned(t0.owner), b = owned(t1.owner)
    expect(a.size + b.size).toBe(10)
    expect([...a].filter(x => b.has(x))).toEqual([])
  })

  it('housekeeping_single_holder', async () => {
    const logs: TickResult[] = []
    const run = () => tick({ taskIndex: 0, taskCount: 2, fetch: idleFetch, log: () => {} }).then(r => (logs.push(r), r))
    const [a, b] = await Promise.all([run(), run()])
    expect([a, b].filter(r => r.housekeeping).length).toBe(1)
    expect([a, b].filter(r => 'ensurePartitions' in r.steps).length).toBe(1)
    expect([a, b].filter(r => 'thumbnails' in r.steps).length).toBe(1)
    const holder = (await sql<{ owner: string }>(`select owner from data.worker_leases where name = 'housekeeping'`)).rows[0].owner
    expect(holder).toBe([a, b].find(r => r.housekeeping)!.owner)
  })

  it('lease_reap', async () => {
    const c = await mkClient([{ source: 'shopify' }])
    await sql(`insert into data.connector_runs (client_id, source, mode, status, started_at, lease_owner)
               values ($1, 'shopify', 'incremental', 'running', now() - interval '25 minutes', 'dead')`, [c])
    await sql(`update data.connector_schedule set lease_until = now() - interval '1 minute', lease_owner = 'dead'
               where client_id = $1`, [c])

    await tick({ taskIndex: 0, taskCount: 1, fetch: idleFetch, log: () => {} })

    const r = (await sql<{ status: string; error: string }>(
      `select status, error from data.connector_runs where client_id = $1 and lease_owner = 'dead'`, [c])).rows[0]
    expect(r.status).toBe('error')
    expect(r.error).toBe('lease expired')
    expect((await sql(`select 1 from data.connector_schedule where client_id = $1 and lease_until is null`, [c])).rowCount).toBe(1)

    await due(c)
    const claimed = await claim(mkTick())
    expect(claimed.some(x => x.client_id === c)).toBe(true)
  })

  it('token_refresh_once', async () => {
    const c = await mkClient([{ source: 'meet', config: { folder_id: 'f1', oauth_client_id: 'cid' } }])
    await sql(`update data.source_tokens set expires_at = now() + interval '5 minutes', refresh_secret = 'refresh',
               attributes = '{"oauth_client_secret":"shh"}'::jsonb where client_id = $1`, [c])

    let calls = 0
    const oauth = stub(url => {
      if (!url.includes('oauth2.googleapis.com')) return {}
      calls++
      return json({ access_token: 'fresh-token', expires_in: 3600, token_type: 'Bearer' })
    })
    await Promise.all([refreshTokens(mkTick(oauth)), refreshTokens(mkTick(oauth))])
    expect(calls).toBe(1)
    const t = (await sql<{ secret: string }>(`select secret from data.source_tokens where client_id = $1`, [c])).rows[0]
    expect(t.secret).toBe('fresh-token')
  })

  it('worker_isolation', async () => {
    await due(CLIENTS.acme, 'shopify'); await due(CLIENTS.acme, 'meta'); await due(CLIENTS.beta, 'shopify')

    const fetch = stub((url, body) =>
      url.includes('acme-test.myshopify.com') ? json({ errors: [{ message: 'connector exploded' }] }, 500)
      : url.includes('myshopify.com') ? emptyShopify(body)
      : url.includes('graph.facebook.com') ? { data: [], paging: {} }
      : {})
    await tick({ taskIndex: 0, taskCount: 1, fetch, log: () => {} })

    const runs = await sql<{ client_id: string; source: string; status: string }>(
      `select distinct on (client_id, source) client_id, source, status from data.connector_runs
       where client_id = any($1::uuid[]) order by client_id, source, started_at desc`, [SEEDED])
    const by = Object.fromEntries(runs.rows.map(r => [`${r.client_id}:${r.source}`, r.status]))
    expect(by[`${CLIENTS.acme}:shopify`]).toBe('error')
    expect(by[`${CLIENTS.beta}:shopify`]).toBe('ok')
    expect(by[`${CLIENTS.acme}:meta`]).toBe('ok')
  })

  it('health_one_row', async () => {
    await computeHealth(mkTick())
    // §5.5: computeHealth skips paused/churned clients, so the count is asserted over active ones.
    const mismatch = await sql<{ slug: string; h: string; s: string }>(
      `select c.slug,
              (select count(*) from api.connector_health_v1 v where v.client_id = c.id) h,
              (select count(*) from data.connector_schedule s where s.client_id = c.id) s
       from data.clients c where c.status = 'active'`)
    expect(mismatch.rows.filter(r => r.h !== r.s)).toEqual([])
    const dupes = await sql(`select 1 from data.connector_health group by client_id, source having count(*) > 1`)
    expect(dupes.rowCount).toBe(0)
  })

  it('timezone_renormalize_scoped', async () => {
    const ids = ['order-0', 'order-1', 'order-2']
    for (const id of ids) {
      const payload = {
        id, name: `#${id}`, createdAt: '2026-09-10T02:00:00Z', updatedAt: '2026-09-10T02:00:00Z',
        processedAt: '2026-09-10T02:00:00Z', displayFinancialStatus: 'PAID', currencyCode: 'USD',
        totalPriceSet: { shopMoney: { amount: '125.00', currencyCode: 'USD' } },
        currentTotalPriceSet: { shopMoney: { amount: '125.00', currencyCode: 'USD' } },
        customer: null, lineItems: { nodes: [] }, refunds: [],
      }
      await sql(`insert into data.raw (client_id, source, entity, external_id, fetched_at, payload_hash, payload)
                 values ($1, 'shopify', 'order', $2, now(), md5($3::jsonb::text), $3::jsonb)`, [CLIENTS.acme, id, JSON.stringify(payload)])
      await sql(`insert into data.raw_latest (client_id, source, entity, external_id, payload_hash, fetched_at)
                 select client_id, source, entity, external_id, payload_hash, fetched_at from data.raw
                 where client_id = $1 and source = 'shopify' and entity = 'order' and external_id = $2
                 on conflict (client_id, source, entity, external_id) do update set fetched_at = excluded.fetched_at,
                   payload_hash = excluded.payload_hash`, [CLIENTS.acme, id])
    }

    const days = async () => (await sql<{ external_id: string; d: string }>(
      `select external_id, to_char(day, 'YYYY-MM-DD') as d from data.money
       where client_id = $1 and external_id = any($2::text[]) order by external_id`, [CLIENTS.acme, ids])).rows
    const betaStamp = async () => (await sql<{ m: string }>(
      `select max(updated_at)::text m from data.money where client_id = $1`, [CLIENTS.beta])).rows[0].m

    await sql(`update data.connector_schedule set renormalize_requested_at = now() where client_id = $1 and source = 'shopify'`, [CLIENTS.acme])
    await renormalize(mkTick())
    expect((await days()).map(r => r.d)).toEqual(['2026-09-09', '2026-09-09', '2026-09-09'])

    const beta = await betaStamp()
    await sql(`update data.clients set timezone = 'Asia/Tokyo' where id = $1`, [CLIENTS.acme])  // trigger arms renormalize
    expect((await sql(`select 1 from data.connector_schedule where client_id = $1 and renormalize_requested_at is not null`, [CLIENTS.acme])).rowCount).toBe(4)
    await renormalize(mkTick())

    expect((await days()).map(r => r.d)).toEqual(['2026-09-10', '2026-09-10', '2026-09-10'])
    expect(await betaStamp()).toBe(beta)
    expect((await sql(`select 1 from data.connector_schedule where client_id = $1 and source = 'shopify' and renormalize_requested_at is not null`, [CLIENTS.acme])).rowCount).toBe(0)
  })
})
