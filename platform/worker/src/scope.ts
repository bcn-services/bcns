// Shared per-table delete scope, extracted from scripts/hard-delete.ts so the shop/redact worker
// task (privacy.ts) can reuse the exact same table list instead of a second hand-maintained copy.
// rawPartitions() moved here from scripts/export.ts for the same reason. Lives under worker/src,
// not scripts/, because the worker's Docker image only COPYs platform/worker (see
// platform/worker/Dockerfile) — scripts/ is not in that image, but scripts run locally via tsx and
// CAN import from worker/src, so hard-delete.ts and export.ts import this file, never the reverse.
import type pg from 'pg'

type Db = Pick<pg.Pool | pg.PoolClient, 'query'>

// Reverse dependency order: items before sets, sets before media, everything before clients.
// Mirrors hard-delete.ts's own former DATA_TABLES list exactly — this IS that list.
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

export interface ScopeOpts {
  /** Restrict to one source. Omitted = every row for the client (hard-delete's existing behavior, unchanged). */
  source?: string
}

/**
 * data.raw's partition table names (pg_inherits, not a fixed list — new months add partitions).
 * Moved here (from the former scripts/export.ts, which now imports it back) so worker/src can
 * reach it too: the worker's Docker image only COPYs platform/worker, not platform/scripts.
 */
export async function rawPartitions(db: Db): Promise<string[]> {
  const r = await db.query<{ relname: string }>(
    `select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'data.raw'::regclass order by 1`)
  return r.rows.map((x) => x.relname)
}

/**
 * One client+source's data.raw rows, chunked at 50k ctids per committed delete — mirrors
 * hard-delete.ts's own unscoped loop, since raw is the one table an active client can grow
 * without bound. Callers run this OUTSIDE any transaction (privacy.ts does, before its guarded
 * transaction): each chunk commits on its own, so a crash mid-loop just leaves fewer rows to
 * redo on the next pass — never a rollback of work already done.
 */
export async function deleteRawScoped(db: Db, clientId: string, source: string): Promise<void> {
  for (const part of await rawPartitions(db)) {
    for (;;) {
      const r = await db.query(
        `delete from data.${part} where ctid = any(array(
           select ctid from data.${part} where client_id = $1 and source = $2 limit 50000))`,
        [clientId, source]
      )
      if (!r.rowCount) break
    }
  }
}

/**
 * Deletes one client's rows across DATA_TABLES's canonical tables only — never data.raw. A
 * source-scoped caller must chunk data.raw itself first via deleteRawScoped (privacy.ts does,
 * outside its transaction, before this runs); hard-delete.ts's unscoped path does its own
 * separately-chunked raw deletion before this runs too. Raw is unbounded, so it is never a plain
 * DELETE here in either path.
 */
export async function deleteClientRows(db: Db, clientId: string, opts: ScopeOpts = {}): Promise<void> {
  const { source } = opts
  const tables = source ? DATA_TABLES.filter((t) => HAS_SOURCE.has(t)) : DATA_TABLES
  for (const t of tables) {
    if (source) await db.query(`delete from data.${t} where client_id = $1 and source = $2`, [clientId, source])
    else await db.query(`delete from data.${t} where client_id = $1`, [clientId])
  }
}
