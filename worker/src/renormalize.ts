// §5.8 re-normalize: replay raw_latest through normalize() without touching the schedule lease.
import { acquireLease, envNum, releaseLease, sql, tx } from './db.js'
import type { Tick } from './db.js'
import { type RawRow, type Source, connectors } from './connectors/index.js'
import { applyWrites, contextFor } from './run.js'

interface Due { client_id: string; source: Source; renormalize_cursor: { entity?: string; external_id?: string } | null }

export async function renormalize(t: Tick): Promise<number> {
  const due = await sql<Due>(
    `select s.client_id, s.source, s.renormalize_cursor
     from data.connector_schedule s join data.clients c on c.id = s.client_id
     where s.renormalize_requested_at is not null and c.status = 'active'
     order by s.renormalize_requested_at`)
  const budget = envNum('RENORMALIZE_BUDGET_MS', 120000)
  const byClient = new Map<string, Due[]>()
  for (const d of due.rows) byClient.set(d.client_id, [...(byClient.get(d.client_id) ?? []), d])

  let total = 0
  for (const [clientId, rows] of byClient) {
    const lease = `renormalize:${clientId}`
    if (!await acquireLease(lease, t.owner)) continue
    try {
      for (const d of rows) total += await renormalizeOne(t, d, budget)
    } finally {
      await releaseLease(lease, t.owner)
    }
  }
  return total
}

async function renormalizeOne(t: Tick, d: Due, budget: number): Promise<number> {
  const conn = connectors[d.source]
  if (!conn) return 0
  const started = Date.now()
  const runId = (await sql<{ id: string }>(
    `insert into data.connector_runs (client_id, source, mode, status, lease_owner)
     values ($1, $2, 'renormalize', 'running', $3) returning id`,
    [d.client_id, d.source, t.owner])).rows[0].id
  let cursor = { entity: d.renormalize_cursor?.entity ?? '', external_id: d.renormalize_cursor?.external_id ?? '' }
  let n = 0
  try {
    const ctx = await contextFor(t, d.client_id, d.source)
    for (;;) {
      // raw_latest is un-partitioned and has one row per key; the join is a PK lookup into one partition.
      const page = await sql<{ entity: string; external_id: string; payload: unknown; source_updated_at: Date | null }>(
        `select l.entity, l.external_id, r.payload, r.source_updated_at
         from data.raw_latest l
         join data.raw r on (r.client_id, r.source, r.entity, r.external_id, r.fetched_at)
                          = (l.client_id, l.source, l.entity, l.external_id, l.fetched_at)
         where l.client_id = $1 and l.source = $2 and (l.entity, l.external_id) > ($3, $4)
         order by l.entity, l.external_id limit 1000`,
        [d.client_id, d.source, cursor.entity, cursor.external_id])
      if (!page.rows.length) {
        await sql(`update data.connector_schedule set renormalize_requested_at = null, renormalize_cursor = null
                   where client_id = $1 and source = $2`, [d.client_id, d.source])
        break
      }
      const raw: RawRow[] = page.rows.map(r => ({
        entity: r.entity, externalId: r.external_id, payload: r.payload,
        sourceUpdatedAt: r.source_updated_at ?? undefined,
      }))
      const last = page.rows[page.rows.length - 1]
      cursor = { entity: last.entity, external_id: last.external_id }
      const changed = await tx(async c => {
        const k = await applyWrites(c, d.client_id, d.source, conn.normalize(ctx, raw))
        await c.query(`update data.connector_schedule set renormalize_cursor = $3::jsonb where client_id = $1 and source = $2`,
          [d.client_id, d.source, JSON.stringify(cursor)])
        return k
      })
      n += changed
      await sql(`update data.connector_runs set pages = pages + 1, rows_fetched = rows_fetched + $2, rows_upserted = rows_upserted + $3 where id = $1`,
        [runId, page.rows.length, changed])
      if (Date.now() - started > budget) break
    }
    await sql(`update data.connector_runs set status = 'ok', finished_at = now() where id = $1`, [runId])
  } catch (e) {
    await sql(`update data.connector_runs set status = 'error', finished_at = now(), error = $2 where id = $1`,
      [runId, e instanceof Error ? e.message : String(e)])
    t.log('renormalize_failed', { client: d.client_id, source: d.source, error: String(e) })
  }
  return n
}
