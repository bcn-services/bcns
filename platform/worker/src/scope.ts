// The one per-table delete scope: scripts/hard-delete.ts, the shop/redact task (privacy.ts) and
// disconnect.ts all use this table list. Lives under worker/src, not scripts/, because the worker's
// Docker image only COPYs platform/worker; scripts run locally via tsx and import this file, never the reverse.
import type pg from 'pg'

type Db = Pick<pg.Pool | pg.PoolClient, 'query'>

// Reverse dependency order: items before sets, sets before media, everything before clients.
export const DATA_TABLES = [
  'media_set_items', 'media_sets', 'media', 'daily_metrics', 'records', 'products', 'money', 'messages',
  'jobs', 'customers', 'raw_latest', 'download_tickets', 'egress_ledger', 'notifications', 'connector_runs',
  'connector_health', 'connector_schedule', 'source_tokens', 'dashboard_versions',
] as const

/**
 * Tables in DATA_TABLES that actually carry a `source` column (checked against
 * 20260912000100_schema.sql, not inferred from what Shopify happens to write today — a source
 * filter must never silently skip a table just because one connector doesn't use it yet).
 * media_set_items, media_sets, download_tickets, egress_ledger, notifications and
 * dashboard_versions have no `source` column and must never be touched by a source-scoped delete.
 */
const HAS_SOURCE = new Set([
  'media', 'daily_metrics', 'records', 'products', 'money', 'messages', 'jobs', 'customers',
  'raw_latest', 'connector_runs', 'connector_health', 'connector_schedule', 'source_tokens',
])

/** data.raw's partition table names (pg_inherits, not a fixed list — new months add partitions). */
export async function rawPartitions(db: Db): Promise<string[]> {
  const r = await db.query<{ relname: string }>(
    `select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'data.raw'::regclass order by 1`)
  return r.rows.map((x) => x.relname)
}

/**
 * One client+source's data.raw rows, one delete per partition. Both callers (privacy.ts, disconnect.ts)
 * run it inside their guarded transaction, where chunking gains nothing: deleted rows stay in the index
 * until commit, so each chunk would rescan them (quadratic). hard-delete.ts chunks its own unscoped loop.
 * ponytail: the 4th argument is ignored. Those two callers still pass `{ chunked: false }` and are frozen
 * for the Shopify review; drop the parameter with them.
 */
export async function deleteRawScoped(db: Db, clientId: string, source: string, _opts?: { chunked?: boolean }): Promise<void> {
  for (const part of await rawPartitions(db)) {
    await db.query(`delete from data.${part} where client_id = $1 and source = $2`, [clientId, source])
  }
}

/**
 * Deletes one client's rows across DATA_TABLES's canonical tables only — never data.raw. A
 * source-scoped caller must clear data.raw itself first via deleteRawScoped (privacy.ts does,
 * in the same transaction, before this runs); hard-delete.ts's unscoped path does its own
 * separately-chunked raw deletion before this runs too. Raw is unbounded, so it is never a plain
 * DELETE here in either path.
 */
export async function deleteClientRows(db: Db, clientId: string, { source }: { source?: string } = {}): Promise<void> {
  const tables = source ? DATA_TABLES.filter((t) => HAS_SOURCE.has(t)) : DATA_TABLES
  for (const t of tables) {
    if (source) await db.query(`delete from data.${t} where client_id = $1 and source = $2`, [clientId, source])
    else await db.query(`delete from data.${t} where client_id = $1`, [clientId])
  }
}
