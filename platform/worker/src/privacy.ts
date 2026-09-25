// shop/redact automation (docs/architecture/retention-30d-shop-redact.md, shipped). The
// shopify-shop-redact Edge Function re-verifies the HMAC itself and queues a
// data.privacy_requests row; this housekeeping step claims pending rows and acts on them.
//
// Never logs the payload, an HMAC, or a secret — this file never sees any of those, only shop,
// webhook id (implicitly, via the row id) and outcome, same as the hub and the Edge Function.
import type pg from 'pg'
import { sql, tx } from './db.js'
import type { Tick } from './db.js'
import { deleteClientRows } from './scope.js'

// sb-bridge: the one store on the bcns-data app. Checked by shop as belt-and-suspenders
// alongside the config.app marker below, in case a schedule row ever lost that marker.
const BRIDGE_SHOP = 'fa8a00-11.myshopify.com' // sb-bridge: remove after SB migrates to bcns Connect

interface PendingRow {
  id: number
  shop: string
  received_at: string
}

interface ScheduleRow {
  client_id: string
  config: { app?: string; shop?: string } | null
}

interface TokenRow {
  created_at: string
  updated_at: string
}

async function escalate(c: pg.PoolClient, id: number, shop: string, reason: string): Promise<void> {
  await c.query(`update data.privacy_requests set status = 'needs_operator', processed_at = now(), error = $2 where id = $1`, [id, reason])
  // Reuses the worker's existing Resend delivery (health.ts's alerts()/sendPending(), already
  // scheduled every tick) instead of a second mailer — a plain data.notifications row is all
  // every other escalation path does. client_id is null: the row is ambiguous or refused by
  // design, so there is no single client to attribute it to.
  await c.query(
    `insert into data.notifications (client_id, kind, dedupe_key, payload)
     values (null, 'shop_redact_needs_operator', 'shop_redact_needs_operator:' || $1, $2::jsonb)
     on conflict (dedupe_key) do nothing`,
    [id, JSON.stringify({ shop, reason })]
  )
}

/**
 * One row, one transaction: a crash mid-delete rolls back everything, including the status
 * flip, so the row stays 'pending' and is retried on the next tick — never half-deleted.
 * Re-checks status under `for update skip locked` so a row already claimed (by a concurrent
 * tick, however unlikely under the housekeeping lease) is skipped rather than double-processed.
 */
async function processOne(row: PendingRow): Promise<boolean> {
  return tx(async (c) => {
    const claim = await c.query<{ status: string }>(
      `select status from data.privacy_requests where id = $1 for update skip locked`,
      [row.id]
    )
    if (claim.rowCount === 0 || claim.rows[0].status !== 'pending') return false

    if (row.shop === BRIDGE_SHOP) {
      await escalate(c, row.id, row.shop, 'sb-bridge shop: never auto-deleted')
      return true
    }

    const matches = await c.query<ScheduleRow>(
      `select client_id, config from data.connector_schedule where source = 'shopify' and lower(config->>'shop') = lower($1)`,
      [row.shop]
    )
    const n = matches.rowCount ?? 0
    if (n !== 1) {
      await escalate(c, row.id, row.shop, n === 0 ? 'no client matches this shop' : `${n} clients match this shop`)
      return true
    }

    const { client_id: clientId, config } = matches.rows[0]
    if (config?.app === 'bcns-data') {
      // sb-bridge: remove after SB migrates to bcns Connect
      await escalate(c, row.id, row.shop, 'sb-bridge config marker: never auto-deleted')
      return true
    }

    const tokens = await c.query<TokenRow>(
      `select created_at, updated_at from data.source_tokens where client_id = $1 and source = 'shopify'`,
      [clientId]
    )
    const token = tokens.rows[0]
    // A token newer than the request means the shop reconnected after uninstalling — the data
    // this webhook was about may already have a live successor; never delete it out from under a
    // reconnect.
    if (token && (new Date(token.created_at) > new Date(row.received_at) || new Date(token.updated_at) > new Date(row.received_at))) {
      await escalate(c, row.id, row.shop, 'shop reconnected after this request was received')
      return true
    }

    await deleteClientRows(c, clientId, { source: 'shopify' })
    await c.query(`update data.privacy_requests set status = 'done', processed_at = now() where id = $1`, [row.id])
    return true
  })
}

export async function shopRedact(t: Tick): Promise<number> {
  const pending = await sql<PendingRow>(
    `select id, shop, received_at::text from data.privacy_requests where status = 'pending' order by received_at limit 50`
  )
  let n = 0
  for (const row of pending.rows) {
    try {
      if (await processOne(row)) n++
    } catch (e) {
      t.log('shop_redact_failed', { id: row.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return n
}
