// shop/redact automation (docs/architecture/retention-30d-shop-redact.md, shipped). The
// shopify-shop-redact Edge Function re-verifies the HMAC itself and queues a
// data.privacy_requests row; this housekeeping step claims pending rows and acts on them.
//
// Never logs the payload, an HMAC, or a secret — this file never sees any of those, only shop,
// webhook id (implicitly, via the row id) and outcome, same as the hub and the Edge Function.
import type pg from 'pg'
import { pool, sql, tx } from './db.js'
import type { Tick } from './db.js'
import { deleteClientRows, deleteRawScoped } from './scope.js'

// sb-bridge: the one store on the bcns-data app. Checked by shop as belt-and-suspenders
// alongside the config.app marker below, in case a schedule row ever lost that marker.
const BRIDGE_SHOP = 'fa8a00-11.myshopify.com' // sb-bridge: remove after SB migrates to bcns Connect

/** S2: a row failing this many times, or sitting pending this long, is an operator problem. */
const MAX_ATTEMPTS = 3

type Db = Pick<pg.Pool | pg.PoolClient, 'query'>

interface PendingRow {
  id: number
  shop: string
  received_at: string
}

interface ScheduleRow {
  client_id: string
  config: { app?: string; shop?: string } | null
}

type Guard = { action: 'delete'; clientId: string } | { action: 'escalate'; reason: string }

/**
 * Resolves shop -> client and decides delete-vs-escalate. Read-only, so it is safe to call twice:
 * once against the pool before any raw delete (S1), and again against the transaction's client to
 * re-check state that may have moved while that chunked delete ran (a reconnect landing mid-delete,
 * say).
 */
async function resolveGuard(db: Db, row: PendingRow): Promise<Guard> {
  if (row.shop === BRIDGE_SHOP) return { action: 'escalate', reason: 'sb-bridge shop: never auto-deleted' }

  const matches = await db.query<ScheduleRow>(
    `select client_id, config from data.connector_schedule where source = 'shopify' and lower(config->>'shop') = lower($1)`,
    [row.shop]
  )
  const n = matches.rowCount ?? 0
  if (n !== 1) return { action: 'escalate', reason: n === 0 ? 'no client matches this shop' : `${n} clients match this shop` }

  const { client_id: clientId, config } = matches.rows[0]
  if (config?.app === 'bcns-data') {
    // sb-bridge: remove after SB migrates to bcns Connect
    return { action: 'escalate', reason: 'sb-bridge config marker: never auto-deleted' }
  }

  // B1: token staleness, computed in SQL against the request's own received_at — never JS Date
  // math, so timezone/precision can't quietly disagree with Postgres's own clock.
  //
  // Confirmed from run.ts / tokens.ts: a successful refresh sets status='active' AND
  // last_refreshed_at=now() (run.ts's refreshOne). Every failure path — refreshOne's catch,
  // run.ts's finishError auth-class branch, and attach_source's reconnect upsert itself — touches
  // status only ('auth_failed', or 'active' on reconnect) and NEVER last_refreshed_at or
  // created_at. updated_at is therefore useless as a staleness signal: tokens.ts's
  // probeAuthFailed bumps it to now() on every hourly pass over a still-dead row, success or
  // failure, so "updated_at is recent" means only "the hourly probe ran," not "this token is
  // alive." A reconnect always sets status='active' without touching created_at/last_refreshed_at,
  // so condition (a) below (status <> 'active') alone catches both a live reconnect and a replay
  // of a captured webhook body queued after one.
  const tokens = await db.query<{ confirmed_dead: boolean }>(
    `select (
       status <> 'active'
       and expires_at is not null
       and greatest(created_at, coalesce(last_refreshed_at, created_at), expires_at) < $2::timestamptz - interval '24 hours'
     ) as confirmed_dead
     from data.source_tokens where client_id = $1 and source = 'shopify'`,
    [clientId, row.received_at]
  )
  if ((tokens.rowCount ?? 0) > 0 && !tokens.rows[0].confirmed_dead) {
    return { action: 'escalate', reason: 'shopify token still active or recently used; cannot confirm uninstall' }
  }
  return { action: 'delete', clientId }
}

async function claimPending(c: pg.PoolClient, id: number): Promise<boolean> {
  const claim = await c.query<{ status: string }>(`select status from data.privacy_requests where id = $1 for update skip locked`, [id])
  return claim.rowCount !== 0 && claim.rows[0].status === 'pending'
}

async function escalate(c: pg.PoolClient, id: number, shop: string, reason: string): Promise<void> {
  await c.query(`update data.privacy_requests set status = 'needs_operator', processed_at = now(), error = $2 where id = $1`, [id, reason])
  // Reuses the worker's existing Resend delivery (health.ts's alerts()/sendPending(), already
  // scheduled every tick) instead of a second mailer — a plain data.notifications row is all
  // every other escalation path does. client_id is null: the row is ambiguous or refused by
  // design, so there is no single client to attribute it to.
  //
  // N3: keyed per shop per day (not per request id), so a shop stuck in needs_operator sends one
  // alert a day, not one per replayed/retried webhook. The payload carries the 48h SLA operators
  // are working against.
  await c.query(
    `insert into data.notifications (client_id, kind, dedupe_key, payload)
     values (null, 'shop_redact_needs_operator', 'shop_redact_needs_operator:' || $1 || ':' || current_date, $2::jsonb)
     on conflict (dedupe_key) do nothing`,
    [shop, JSON.stringify({ shop, reason, deadline: '48h from uninstall' })]
  )
}

/**
 * One row: a read-only guard check, then — only if it says delete — a chunked raw-partition
 * delete OUTSIDE any transaction (S1: raw is unbounded, so this must never hold one long-lived
 * transaction open), then a transaction that re-checks the guard under the privacy row's own lock
 * before touching the canonical tables and flipping status. Re-running is idempotent: a crash
 * after the raw chunks but before the final transaction leaves the row pending, and the next
 * tick's raw delete finds nothing left to chunk before repeating the (cheap) canonical delete.
 */
async function processOne(row: PendingRow): Promise<boolean> {
  const first = await resolveGuard(pool(), row)

  if (first.action === 'delete') {
    await deleteRawScoped(pool(), first.clientId, 'shopify')
  }

  return tx(async (c) => {
    if (!(await claimPending(c, row.id))) return false

    // Re-check under the privacy row's lock: the raw delete above ran with no lock held, so state
    // (a reconnect, say) may have moved since resolveGuard's first, unlocked read.
    const guard = await resolveGuard(c, row)
    if (guard.action === 'escalate') {
      await escalate(c, row.id, row.shop, guard.reason)
      return true
    }

    await deleteClientRows(c, guard.clientId, { source: 'shopify' })
    await c.query(`update data.privacy_requests set status = 'done', processed_at = now() where id = $1`, [row.id])
    return true
  })
}

/**
 * S2: a row that keeps failing (attempts >= MAX_ATTEMPTS) or has simply sat pending too long
 * (received_at older than 24h) is an operator problem, not a retry-forever one — escalate it with
 * whatever the last recorded error was, via the same path as every other escalation.
 */
async function escalateStuck(t: Tick): Promise<void> {
  const stuck = await sql<{ id: number; shop: string; error: string | null }>(
    `select id, shop, error from data.privacy_requests
     where status = 'pending' and (attempts >= $1 or received_at < now() - interval '24 hours')`,
    [MAX_ATTEMPTS]
  )
  for (const row of stuck.rows) {
    try {
      await tx(async (c) => {
        if (!(await claimPending(c, row.id))) return
        const last = (row.error ?? 'no error recorded; pending too long').slice(0, 500)
        await escalate(c, row.id, row.shop, `stuck after repeated failures or >24h pending: ${last}`)
      })
    } catch (e) {
      t.log('shop_redact_escalate_stuck_failed', { id: row.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
}

export async function shopRedact(t: Tick): Promise<number> {
  await escalateStuck(t)

  const pending = await sql<PendingRow>(
    `select id, shop, received_at::text from data.privacy_requests where status = 'pending' order by received_at limit 50`
  )
  let n = 0
  for (const row of pending.rows) {
    try {
      if (await processOne(row)) n++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      t.log('shop_redact_failed', { id: row.id, error: message })
      // S2: a separate statement, not part of the (rolled-back) failed transaction above — the
      // attempt still counts even though nothing else about this row changed.
      await sql(`update data.privacy_requests set attempts = attempts + 1, error = $2 where id = $1`, [row.id, message.slice(0, 2000)])
    }
  }
  return n
}
