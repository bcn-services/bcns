// Postgres access. Transaction-pooler safe (§5.1): no session state, no named prepared
// statements, every multi-statement unit is an explicit transaction on one pooled client.
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** One tick's runtime context; every step takes it. Built by tick() from env + opts. */
export interface Tick {
  taskIndex: number
  taskCount: number
  owner: string
  fetch: typeof globalThis.fetch
  /** True when the caller injected a transport — the per-source minimum delay is then moot. */
  stubbed: boolean
  now: () => Date
  log: (event: string, data?: Record<string, unknown>) => void
  budgetMs: number
  claimLimit: number
}

let _pool: pg.Pool | undefined

export function pool(): pg.Pool {
  return (_pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    max: 4,
  }))
}

export const sql = <T extends pg.QueryResultRow = any>(text: string, params?: unknown[]) =>
  pool().query<T>(text, params)

/** Explicit transaction on one client from the pool. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect()
  try {
    await c.query('begin')
    const r = await fn(c)
    await c.query('commit')
    return r
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

export async function closePool(): Promise<void> {
  await _pool?.end()
  _pool = undefined
}

let _sb: SupabaseClient | undefined

/** Service-key Storage handle for the `media` bucket. The service key is used only here (§5.1). */
export function storage() {
  if (!_sb) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Storage')
    _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return _sb.storage.from('media')
}

export const envStr = (k: string, d = '') => process.env[k] ?? d
export const envNum = (k: string, d: number) => {
  const v = Number(process.env[k])
  return Number.isFinite(v) && process.env[k] !== undefined && process.env[k] !== '' ? v : d
}

/**
 * D23 row mutex. Works for the pre-seeded `housekeeping` row and for ad-hoc
 * `renormalize:<client_id>`; 0 rows back means someone else holds it, so skip the step.
 */
export async function acquireLease(name: string, owner: string, ttl = '9 minutes'): Promise<boolean> {
  const r = await sql(
    `insert into data.worker_leases as l (name, lease_until, owner)
     values ($1, now() + $3::interval, $2)
     on conflict (name) do update set lease_until = excluded.lease_until, owner = excluded.owner
       where l.lease_until < now()
     returning name`,
    [name, owner, ttl])
  return (r.rowCount ?? 0) > 0
}

/** Expire the lease so the next tick in the same process can take it; the owner stays for auditing. */
export async function releaseLease(name: string, owner: string): Promise<void> {
  await sql(`update data.worker_leases set lease_until = now() where name = $1 and owner = $2`, [name, owner])
}
