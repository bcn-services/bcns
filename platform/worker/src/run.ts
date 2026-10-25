// §5.3 claim and run: raw write, normalize, canonical upsert, tombstones, cursors, error policy.
import type { PoolClient } from 'pg'
import pLimit from 'p-limit'
import { sql, storage, tx, type Tick } from './db.js'
import {
  type CanonicalWrites, type Connector, type Json, type MetricRow, type RawRow, type RunContext,
  type Source, type TokenRow, SourceError, classify, connectors, redact, sleep,
} from './connectors/index.js'

export interface ScheduleRow {
  client_id: string; source: Source; interval: string; backfill_from: Date
  backfill_cursor: Json | null; incremental_cursor: Json; config: Json
  lease_owner: string | null
}

// ------------------------------------------------------------------ raw (D5)

/** One statement pair: bump raw_latest, append only the keys whose payload hash changed. */
export async function writeRaw(c: PoolClient, clientId: string, source: Source, rows: RawRow[], runId: number | null): Promise<number> {
  if (!rows.length) return 0
  const seen = new Map<string, RawRow>()
  for (const r of rows) seen.set(`${r.entity}\u0000${r.externalId}`, r) // last write wins within a page
  const uniq = [...seen.values()]
  const r = await c.query(
    `with incoming as (
       select $1::uuid as client_id, $2::data.source as source, t.entity, t.external_id,
              t.source_updated_at, t.payload, md5(t.payload::text) as payload_hash
       from unnest($3::text[], $4::text[], $5::timestamptz[], $6::jsonb[])
         as t(entity, external_id, source_updated_at, payload)
     ), changed as (
       insert into data.raw_latest as l (client_id, source, entity, external_id, payload_hash, fetched_at)
       select client_id, source, entity, external_id, payload_hash, now() from incoming
       on conflict (client_id, source, entity, external_id) do update
         set payload_hash = excluded.payload_hash, fetched_at = excluded.fetched_at
         where l.payload_hash is distinct from excluded.payload_hash
       returning client_id, source, entity, external_id
     )
     insert into data.raw (client_id, source, entity, external_id, fetched_at, source_updated_at, run_id, payload_hash, payload)
     select i.client_id, i.source, i.entity, i.external_id, now(), i.source_updated_at, $7, i.payload_hash, i.payload
     from incoming i join changed using (client_id, source, entity, external_id)
     on conflict do nothing`,
    [clientId, source,
      uniq.map(x => x.entity), uniq.map(x => x.externalId),
      uniq.map(x => x.sourceUpdatedAt?.toISOString() ?? null),
      uniq.map(x => JSON.stringify(x.payload)), runId],
  )
  return r.rowCount ?? 0
}

// ------------------------------------------------------------------ canonical upsert (R7/R8)

type ColSpec = Record<string, string>
const CANON: Record<string, ColSpec> = {
  customers: { email: 'text', name: 'text', first_order_at: 'timestamptz', orders_count: 'int', total_spent_minor: 'bigint', currency: 'char(3)', attributes: 'jsonb', source_updated_at: 'timestamptz' },
  jobs: { kind: 'text', title: 'text', status: 'text', is_done: 'boolean', priority: 'text', group_name: 'text', owner: 'text', due_on: 'date', url: 'text', position: 'int', attributes: 'jsonb', source_updated_at: 'timestamptz' },
  messages: { kind: 'text', title: 'text', body: 'text', occurred_at: 'timestamptz', participants: 'text[]', url: 'text', attributes: 'jsonb', source_updated_at: 'timestamptz' },
  money: { kind: 'text', occurred_at: 'timestamptz', day: 'date', amount_minor: 'bigint', currency: 'char(3)', status: 'text', order_number: 'text', customer_external_id: 'text', items_count: 'int', url: 'text', attributes: 'jsonb', source_updated_at: 'timestamptz' },
  media: { kind: 'text', storage_path: 'text', thumb_path: 'text', filename: 'text', mime: 'text', bytes: 'bigint', width: 'int', height: 'int', title: 'text', tags: 'text[]', attributes: 'jsonb', source_updated_at: 'timestamptz' },
  products: { title: 'text', handle: 'text', status: 'text', vendor: 'text', product_type: 'text', price_minor: 'bigint', currency: 'char(3)', inventory_quantity: 'int', variants_count: 'int', image_url: 'text', url: 'text', attributes: 'jsonb', source_updated_at: 'timestamptz' },
  records: { kind: 'text', title: 'text', body: 'text', occurred_at: 'timestamptz', attributes: 'jsonb', source_updated_at: 'timestamptz' },
}
const DEFAULTS: Record<string, Json> = { attributes: {}, tags: [] }
/** A connector re-upsert must not blank a path the download (or a Drive thumbnail copy) already set. */
const excl = (k: string) => (k === 'storage_path' || k === 'thumb_path' ? `coalesce(excluded.${k}, t.${k})` : `excluded.${k}`)

export async function upsertCanonical(c: PoolClient, table: string, clientId: string, source: Source, rows: Json[]): Promise<number> {
  const spec = CANON[table]
  if (!rows?.length) return 0
  const cols = Object.keys(spec)
  const byId = new Map<string, Json>()
  for (const r of rows) {
    const o: Json = { external_id: r.externalId }
    for (const k of cols) o[k] = r[k] ?? DEFAULTS[k] ?? null
    byId.set(o.external_id, o)
  }
  const q = `insert into data.${table} as t (client_id, source, external_id, ${cols.join(', ')})
    select $1::uuid, $2::data.source, x.external_id, ${cols.map(k => `x.${k}`).join(', ')}
    from jsonb_to_recordset($3::jsonb) as x(external_id text, ${cols.map(k => `${k} ${spec[k]}`).join(', ')})
    on conflict (client_id, source, external_id) do update
      set ${cols.map(k => `${k} = ${excl(k)}`).join(', ')}
      where (${cols.map(k => `t.${k}`).join(', ')}) is distinct from (${cols.map(excl).join(', ')})`
  const r = await c.query(q, [clientId, source, JSON.stringify([...byId.values()])])
  return r.rowCount ?? 0
}

export async function upsertMetrics(c: PoolClient, clientId: string, source: Source, rows: MetricRow[]): Promise<number> {
  if (!rows?.length) return 0
  let n = 0
  for (const firstWins of [false, true]) {
    const batch = rows.filter(r => !!r.firstWins === firstWins)
    if (!batch.length) continue
    const byKey = new Map<string, MetricRow>()
    for (const r of batch) byKey.set(`${r.day}|${r.entity_kind}|${r.entity_id}|${r.metric}`, r)
    const conflict = firstWins
      ? 'do nothing'
      : `do update set value = excluded.value, currency = excluded.currency
         where (t.value, t.currency) is distinct from (excluded.value, excluded.currency)`
    const r = await c.query(
      `insert into data.daily_metrics as t (client_id, source, day, entity_kind, entity_id, metric, value, currency)
       select $1::uuid, $2::data.source, x.day, x.entity_kind, x.entity_id, x.metric, x.value, x.currency
       from jsonb_to_recordset($3::jsonb) as x(day date, entity_kind text, entity_id text, metric text, value numeric, currency char(3))
       on conflict (client_id, source, day, entity_kind, entity_id, metric) ${conflict}`,
      [clientId, source, JSON.stringify([...byKey.values()].map(({ firstWins: _f, ...m }) => ({ currency: null, ...m })))],
    )
    n += r.rowCount ?? 0
  }
  return n
}

export async function applyWrites(c: PoolClient, clientId: string, source: Source, w: CanonicalWrites): Promise<number> {
  let n = 0
  for (const table of Object.keys(CANON)) n += await upsertCanonical(c, table, clientId, source, (w as Json)[table] ?? [])
  n += await upsertMetrics(c, clientId, source, w.dailyMetrics ?? [])
  return n
}

// ------------------------------------------------------------------ claim (§5.3)

export async function claim(t: Tick): Promise<ScheduleRow[]> {
  // ((h % n) + n) % n, not h % n: hashtext is signed and a negative remainder matches no task index.
  const r = await sql<ScheduleRow>(
    `with due as (
       select s.client_id, s.source
       from data.connector_schedule s
       join data.clients c on c.id = s.client_id
       left join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
       where s.enabled and c.status = 'active'
         and s.next_run_at <= now()
         and (s.lease_until is null or s.lease_until < now())
         and coalesce(tk.status, 'active') = 'active'
         and (tk.expires_at is null or tk.expires_at > now())
         and ((hashtext(s.client_id::text) % $3) + $3) % $3 = $4
       order by (s.backfill_cursor is not null), s.next_run_at
       limit $1
       for update of s skip locked)
     update data.connector_schedule s
     set lease_until = now() + interval '8 minutes', lease_owner = $2
     from due where (s.client_id, s.source) = (due.client_id, due.source)
     returning s.*`,
    [t.claimLimit, t.owner, t.taskCount, t.taskIndex],
  )
  return r.rows
}

export async function claimAndRun(t: Tick): Promise<number> {
  const rows = await claim(t)
  if (!rows.length) return 0
  const limit = pLimit(t.claimLimit)
  await Promise.all(rows.map(row => limit(() => runOne(t, row).catch(e => t.log('run_uncaught', { client: row.client_id, source: row.source, error: redact(String(e)) })))))
  return rows.length
}

// ------------------------------------------------------------------ per-(client, source) run

/** Per-(source, client_id) semaphore — never process-wide, so no client waits on another's budget (R26). */
const semaphores = new Map<string, ReturnType<typeof pLimit>>()
const FETCH_TIMEOUT_MS = 60_000
function rateLimited(t: Tick, key: string, rl: { concurrency: number; minDelayMs: number }): typeof globalThis.fetch {
  let sem = semaphores.get(key)
  if (!sem) { sem = pLimit(rl.concurrency); semaphores.set(key, sem) }
  let last = 0
  const delay = t.stubbed ? 0 : rl.minDelayMs
  return ((input: Json, init?: Json) => sem!(async () => {
    const wait = last + delay - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    // DESIGN sets no per-request timeout; without one a hung upstream outlives the 8-minute lease.
    return t.fetch(input, { ...(init ?? {}), signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  })) as typeof globalThis.fetch
}

export async function loadToken(clientId: string, source: Source): Promise<TokenRow> {
  const r = await sql<TokenRow>(`select client_id, source, kind, secret, refresh_secret, expires_at, attributes from data.source_tokens where client_id = $1 and source = $2`, [clientId, source])
  if (!r.rows[0]) throw new Error(`no source_tokens row for ${source}`)
  return r.rows[0]
}

export function makeContext(t: Tick, row: ScheduleRow, conn: Connector, token: TokenRow, config: Json, timezone: string): RunContext {
  return {
    clientId: row.client_id,
    source: row.source,
    token,
    config,
    timezone,
    fetch: rateLimited(t, `${row.source}:${row.client_id}`, conn.defaults.rateLimit),
    log: (event, data) => t.log(event, { client: row.client_id, source: row.source, ...data }),
    async putObject(path, bytes, mime) {
      const { error } = await storage().upload(path, bytes, { contentType: mime, upsert: true })
      if (error) throw new Error(`putObject ${path}: ${error.message}`)
    },
    async hasMetricToday(metric) {
      const r = await sql(`select 1 from data.daily_metrics where client_id = $1 and source = $2 and metric = $3
                           and entity_kind = 'store' and entity_id = 'store'
                           and day = (now() at time zone (select timezone from data.clients where id = $1))::date`,
        [row.client_id, row.source, metric])
      return (r.rowCount ?? 0) > 0
    },
    // Known = a row whose bytes or thumbnail landed; one left without either is retried next run (Drive thumb, Meta download).
    async knownMedia(ids) {
      if (!ids.length) return new Set()
      const r = await sql<{ external_id: string }>(`select external_id from data.media where client_id = $1 and source = $2 and external_id = any($3::text[]) and coalesce(storage_path, thumb_path) is not null`, [row.client_id, row.source, ids])
      return new Set(r.rows.map(x => x.external_id))
    },
    // Monday write-back (set_status_done / set_status_undone): the status text the synced row holds, the
    // `previous` the newest succeeded set_status_done recorded for the item (a recorded null, an empty label,
    // is returned as null: undo clears), and whether the newest already-run set_status_done failed.
    async jobStatus(externalId) {
      const r = await sql<{ status: string | null }>(`select status from data.jobs where client_id = $1 and source = $2 and external_id = $3 limit 1`, [row.client_id, row.source, externalId])
      return r.rows[0]?.status ?? null
    },
    async previousStatus(externalId) {
      const r = await sql<{ previous: string | null }>(
        `select result->>'previous' as previous from data.source_commands
         where client_id = $1 and source = $2 and kind = 'set_status_done' and status = 'done' and payload->>'item_id' = $3 and result ? 'previous'
         order by created_at desc limit 1`, [row.client_id, row.source, externalId])
      return r.rows[0]?.previous ?? null
    },
    // Commands run oldest first, so a set_status_done that has run (status <> 'queued') is older than the undo asking.
    async lastDoneFailed(externalId) {
      const r = await sql<{ status: string }>(
        `select status from data.source_commands
         where client_id = $1 and source = $2 and kind = 'set_status_done' and status <> 'queued' and payload->>'item_id' = $3
         order by created_at desc limit 1`, [row.client_id, row.source, externalId])
      return r.rows[0]?.status === 'failed'
    },
    async mergeConfig(patch) {
      Object.assign(config, patch)
      await sql(`update data.connector_schedule set config = config || $3::jsonb where client_id = $1 and source = $2`, [row.client_id, row.source, JSON.stringify(patch)])
    },
  }
}

/** Build a context for a (client_id, source) outside a claimed run (token refresh, renormalize). */
export async function contextFor(t: Tick, clientId: string, source: Source): Promise<RunContext> {
  const conn = connectors[source]
  const r = await sql<{ config: Json; timezone: string }>(
    `select s.config, c.timezone from data.connector_schedule s join data.clients c on c.id = s.client_id
     where s.client_id = $1 and s.source = $2`, [clientId, source])
  const row = { client_id: clientId, source } as ScheduleRow
  return makeContext(t, row, conn, await loadToken(clientId, source), conn.configSchema.parse(r.rows[0]?.config ?? {}), r.rows[0]?.timezone ?? 'UTC')
}

export async function runOne(t: Tick, row: ScheduleRow): Promise<void> {
  const conn = connectors[row.source]
  const mode = row.backfill_cursor ? 'backfill' : 'incremental'
  const started = Date.now()
  const runId = (await sql<{ id: string }>(
    `insert into data.connector_runs (client_id, source, mode, status, lease_owner) values ($1, $2, $3, 'running', $4) returning id`,
    [row.client_id, row.source, mode, t.owner])).rows[0].id

  try {
    if (!conn) throw new Error(`no connector for source ${row.source}`)
    const token = await loadToken(row.client_id, row.source)
    const config = conn.configSchema.parse(row.config ?? {})
    const tzq = await sql<{ timezone: string }>(`select timezone from data.clients where id = $1`, [row.client_id])
    const ctx = makeContext(t, row, conn, token, config, tzq.rows[0].timezone)

    // §5.4: a run whose token is already expired refreshes it under the same row lock first.
    if (token.expires_at && token.expires_at.getTime() <= Date.now() && conn.refreshToken) {
      const fresh = await refreshOne(ctx, conn)
      if (fresh) token.secret = fresh
    }

    const iter = mode === 'backfill'
      ? conn.backfill(ctx, new Date(row.backfill_from), row.backfill_cursor)
      : conn.incremental(ctx, row.incremental_cursor ?? {})

    const seen = new Map<string, Set<string>>()      // canonical table -> external_ids seen this run
    const finished = new Set<string>()               // fullList entities that reported entityDone
    const touchedCustomers = new Set<string>()       // only these get the §4.2 order-aggregate recompute
    let done = false

    for await (const page of iter) {
      await tx(async c => {
        await writeRaw(c, row.client_id, row.source, page.raw, Number(runId))
        const writes = conn.normalize(ctx, page.raw)
        for (const cu of writes.customers ?? []) touchedCustomers.add(cu.externalId)
        const n = await applyWrites(c, row.client_id, row.source, writes)
        if (mode === 'backfill') {
          await c.query(`update data.connector_schedule set backfill_cursor = $3::jsonb where client_id = $1 and source = $2 and lease_owner = $4`,
            [row.client_id, row.source, JSON.stringify(page.cursor ?? {}), t.owner])
        } else if (page.entityDone) {
          await c.query(`update data.connector_schedule
                         set incremental_cursor = coalesce(incremental_cursor, '{}'::jsonb) || jsonb_build_object($3::text, $4::jsonb)
                         where client_id = $1 and source = $2 and lease_owner = $5`,
            [row.client_id, row.source, page.entity, JSON.stringify(page.cursor ?? {}), t.owner])
        }
        const counts: Record<string, number> = page.entity ? { [page.entity]: 0 } : {}
        for (const r of page.raw) counts[r.entity] = (counts[r.entity] ?? 0) + 1
        await c.query(
          `update data.connector_runs r set pages = pages + 1, rows_fetched = rows_fetched + $2, rows_upserted = rows_upserted + $3,
             entity_rows = r.entity_rows || (select coalesce(jsonb_object_agg(k, coalesce((r.entity_rows ->> k)::int, 0) + v::int), '{}'::jsonb)
                                             from jsonb_each_text($4::jsonb) as e(k, v))
           where id = $1`,
          [runId, page.raw.length, n, JSON.stringify(counts)])
      })

      for (const fl of conn.defaults.fullList ?? []) {
        const ids = page.raw.filter(r => r.entity === fl.entity).map(r => r.externalId)
        if (ids.length || page.entity === fl.entity) {
          const s = seen.get(fl.table) ?? new Set<string>()
          for (const id of ids) s.add(id)
          seen.set(fl.table, s)
        }
        if (page.entity === fl.entity && page.entityDone) finished.add(fl.entity)
      }

      if (page.done) { done = true; break }
      if (Date.now() - started > t.budgetMs) break
    }

    // §4.1: a complete run tombstones; a budget-stopped or failed one never does.
    if (done) {
      // A Drive walk with no files at all is far likelier an unshared or wrong folder than a client who
      // deleted everything, and a media tombstone is lossy (30-day purge): fail the run (cursors untouched,
      // next run retries) instead. Tradeoff: a client who really empties the folder never gets those rows
      // tombstoned; health shows error (then stale) until something is in it again.
      if (emptyFullListTables(conn.defaults.fullList, seen, finished).length) {
        throw new SourceError(row.source, 'found nothing to sync: the folder is empty or not shared with the connected account, so nothing was removed')
      }
      await applyTombstones(conn, row, seen, finished)
    }
    if (touchedCustomers.size) await recomputeCustomers(row.client_id, [...touchedCustomers])

    await sql(`update data.connector_runs set status = 'ok', finished_at = now() where id = $1`, [runId])
    // Every schedule write is guarded by this tick's lease: a reaped-and-reclaimed row belongs to the new owner.
    const fin = await sql(
      `update data.connector_schedule s set
         last_run_at = now(), last_success_at = now(), consecutive_failures = 0,
         last_error = null, last_error_at = null, lease_until = null, lease_owner = null,
         backfill_cursor = case when $3 then null else s.backfill_cursor end,
         next_run_at = case when $4 then now() else now() + s.interval end
       where s.client_id = $1 and s.source = $2 and s.lease_owner = $5`,
      [row.client_id, row.source, mode === 'backfill' && done, mode === 'backfill', t.owner],
    )
    if (!fin.rowCount) t.log('run_lost_lease', { client: row.client_id, source: row.source })
    if (fin.rowCount && mode === 'backfill' && done) {
      await sql(`insert into data.notifications (client_id, kind, dedupe_key, payload)
                 values ($1, 'backfill_done', $2, jsonb_build_object('source', $3::text))
                 on conflict (dedupe_key) do nothing`,
        [row.client_id, `backfill_done:${row.client_id}:${row.source}`, row.source])
    }
    t.log('run_ok', { client: row.client_id, source: row.source, mode, done })
  } catch (e) {
    await finishError(t, row, Number(runId), e)
  }
}

/**
 * §4.1 guard: fullList tables a complete run would tombstone although their listing held no ids at all.
 * `media` only: it is the one table whose tombstone purges (30 days, cascading into media_set_items).
 * Monday/Meta need no guard: an unshared board or account already throws upstream, and their
 * tombstones heal when the ids come back, so guarding them would only fail a really-emptied board forever.
 */
export function emptyFullListTables(
  fullList: readonly { entity: string; table: string }[] | undefined,
  seen: ReadonlyMap<string, ReadonlySet<string>>, finished: ReadonlySet<string>,
): string[] {
  const tables = [...new Set((fullList ?? []).map(f => f.table))].filter(t => t === 'media')
  return tables.filter(t => (fullList ?? []).filter(f => f.table === t).every(f => finished.has(f.entity))
    && !seen.get(t)?.size)
}

async function applyTombstones(conn: Connector, row: ScheduleRow, seen: Map<string, Set<string>>, finished: Set<string>): Promise<void> {
  const byTable = new Map<string, { entities: string[]; ids: string[] }>()
  for (const fl of conn.defaults.fullList ?? []) {
    const e = byTable.get(fl.table) ?? { entities: [], ids: [] }
    e.entities.push(fl.entity)
    e.ids.push(...(seen.get(fl.table) ?? []))
    byTable.set(fl.table, e)
  }
  for (const [table, e] of byTable) {
    if (!e.entities.every(x => finished.has(x))) continue
    const ids = [...new Set(e.ids)]
    // media rows own storage objects: schedule the same 30-day purge as api.delete_media, cancel it if the id returns.
    const purge = table === 'media' ? `, purge_after = now() + interval '30 days'` : ''
    const unpurge = table === 'media' ? ', purge_after = null' : ''
    await sql(`update data.${table} set deleted_at = now()${purge}
               where client_id = $1 and source = $2 and deleted_at is null and not (external_id = any($3::text[]))`,
      [row.client_id, row.source, ids])
    await sql(`update data.${table} set deleted_at = null${unpurge}
               where client_id = $1 and source = $2 and deleted_at is not null and external_id = any($3::text[])`,
      [row.client_id, row.source, ids])
  }
}

/** §4.2: order counters recomputed from `money` (so the aggregate is idempotent), for the run's customers only. */
async function recomputeCustomers(clientId: string, ids: string[]): Promise<void> {
  await sql(
    `update data.customers c
     set first_order_at = a.f, orders_count = a.n::int, total_spent_minor = a.t
     from (select customer_external_id, min(occurred_at) f, count(*) n, sum(amount_minor) t
           from data.money where client_id = $1 and source = 'shopify' and kind = 'order'
             and customer_external_id = any($2::text[])
           group by 1) a
     where c.client_id = $1 and c.source = 'shopify' and c.external_id = a.customer_external_id
       and (c.first_order_at, c.orders_count, c.total_spent_minor) is distinct from (a.f, a.n::int, a.t)`,
    [clientId, ids])
}

export async function finishError(t: Tick, row: ScheduleRow, runId: number, e: unknown): Promise<void> {
  // Redacted once, up front: this text reaches the log, connector_runs.error and the
  // status columns below, and a provider error body can echo a credential.
  const message = redact(e instanceof Error ? e.message : String(e))
  const cls = classify(e)
  t.log('run_failed', { client: row.client_id, source: row.source, class: cls, error: message })

  if (cls === 'throttle') {
    // §5.3 step 6: a throttle is a budget stop, never an error. The cursor stays committed.
    await sql(`update data.connector_runs set status = 'ok', finished_at = now() where id = $1`, [runId])
    await sql(`update data.connector_schedule set last_run_at = now(), last_success_at = now(),
               lease_until = null, lease_owner = null, next_run_at = now() + interval '1 minute'
               where client_id = $1 and source = $2 and lease_owner = $3`, [row.client_id, row.source, t.owner])
    return
  }

  await sql(`update data.connector_runs set status = $2, finished_at = now(), error = $3 where id = $1`,
    [runId, cls === 'auth' ? 'auth_failed' : 'error', message])
  if (cls === 'auth') {
    await sql(`update data.source_tokens set status = 'auth_failed', status_detail = $3 where client_id = $1 and source = $2 and status <> 'revoked'`,
      [row.client_id, row.source, message])
  }
  await sql(
    `update data.connector_schedule s set
       last_run_at = now(), last_error = $3, last_error_at = now(),
       consecutive_failures = s.consecutive_failures + 1,
       next_run_at = now() + least(s.interval, power(2, least(s.consecutive_failures + 1, 20))::int * interval '1 minute'),
       lease_until = null, lease_owner = null
     where s.client_id = $1 and s.source = $2 and s.lease_owner = $4`,
    [row.client_id, row.source, message, t.owner])
}

/** Refresh this row's token in place; returns the new secret. Shared with §5.4.
 *  Only a `classify(e) === 'auth'` failure (a dead/invalid refresh token) marks the row
 *  auth_failed — a transient 5xx or network error leaves status untouched so a healthy
 *  credential isn't shown a reconnect prompt over a blip, and tokens.ts's hourly retry
 *  gets another shot at it. The success-path update runs outside the try so a failure
 *  there (e.g. a DB error) propagates out of tx() instead of being swallowed and
 *  miscategorized as a refresh failure. */
export async function refreshOne(ctx: RunContext, conn: Connector): Promise<string | null> {
  if (!conn.refreshToken) return null
  type Fresh = { secret: string; expiresAt: Date; refreshSecret?: string | null }
  const st: { rotated: Fresh | null; wasFailed: boolean } = { rotated: null, wasFailed: false }

  // `coalesce`: a connector that does not rotate (Google) returns no refreshSecret
  // and must keep the one it has. `status`/`status_detail` are reset because a
  // successful refresh IS the proof the credential works — without this an
  // auth_failed row that recovers stays marked broken forever.
  const save = async (q: (text: string, params: unknown[]) => Promise<unknown>, fresh: Fresh) => {
    await q(
      `update data.source_tokens set secret = $3, expires_at = $4, last_refreshed_at = now(),
         refresh_secret = coalesce($5, refresh_secret), status = 'active', status_detail = null
       where client_id = $1 and source = $2 and status <> 'revoked'`,
      [ctx.clientId, ctx.source, fresh.secret, fresh.expiresAt, fresh.refreshSecret ?? null])
    // Only when recovering: a healthy row refreshes hourly and must not wipe a sync run's error.
    if (st.wasFailed) {
      await q(`update data.connector_schedule set last_error = null, last_error_at = null where client_id = $1 and source = $2`,
        [ctx.clientId, ctx.source])
    }
  }

  try {
    return await tx(async c => {
      const got = await c.query<{ secret: string; status: string }>(
        `select secret, status from data.source_tokens where client_id = $1 and source = $2 and expires_at < now() + $3::interval
           and status <> 'revoked'
         for update skip locked`, [ctx.clientId, ctx.source, conn.refreshLead ?? '10 minutes'])
      if (!got.rows.length) return null
      st.wasFailed = got.rows[0].status === 'auth_failed'

      let fresh: Fresh
      try {
        fresh = await conn.refreshToken!(ctx)
      } catch (e) {
        if (classify(e) === 'auth') {
          // Also on connector_schedule.last_error: computeHealth copies that onto the hub
          // card (connector_health_v1.last_error). No run fails for a refresh, so without
          // this an auth_failed card showed no reason and the worker logged nothing.
          const detail = redact(e instanceof Error ? e.message : String(e))
          await c.query(`update data.source_tokens set status = 'auth_failed', status_detail = $3 where client_id = $1 and source = $2 and status <> 'revoked'`,
            [ctx.clientId, ctx.source, detail])
          await c.query(`update data.connector_schedule set last_error = $3, last_error_at = now() where client_id = $1 and source = $2`,
            [ctx.clientId, ctx.source, detail])
          ctx.log('token_refresh_auth_failed', { error: detail })
        } else {
          // Transient or config (e.g. missing app credentials): the worker log says why. A long-lead
          // connector stays inside its window for days, so bump updated_at to push the retry out an
          // hour (refreshTokens); short-lived ones stay due and retry every tick.
          ctx.log('token_refresh_failed', { error: redact(e instanceof Error ? e.message : String(e)) })
          if (conn.refreshLead) await c.query(`update data.source_tokens set updated_at = now() where client_id = $1 and source = $2`, [ctx.clientId, ctx.source])
        }
        return null
      }

      st.rotated = fresh
      await save((text, params) => c.query(text, params), fresh)
      return fresh.secret
    })
  } catch (e) {
    // The provider answered, so a rotating one (Intuit) has already spent the stored
    // refresh token; the rollback would strand the new pair and the next attempt
    // dies on invalid_grant. Write it once more on a fresh connection (the tx, and its
    // row lock, are gone), keeping the original error if that fails too.
    // ponytail: one retry, no queue; another worker can claim the row in the gap.
    const { rotated } = st
    if (!rotated) throw e
    ctx.log('token_write_retry', { error: redact(e instanceof Error ? e.message : String(e)) })
    await save(sql, rotated).catch(() => { throw e })
    return rotated.secret
  }
}
