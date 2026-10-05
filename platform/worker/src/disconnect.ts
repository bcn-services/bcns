// Owner-initiated QuickBooks disconnect, worker half. api.disconnect_source (migration
// 20261002000100) marks the token 'revoked' / 'owner_disconnect'; this housekeeping step revokes
// it at Intuit and then deletes the token row, schedule, health row and the client's QuickBooks data.
//
// Only status_detail 'owner_disconnect' rows: a QuickBooks row an operator revoked by hand is
// never auto-deleted. Never logs the token: only client id, outcome, and redact()ed error text.
import { envStr, sql, tx, type Tick } from './db.js'
import { SourceError, reason, redact } from './connectors/index.js'
import { deleteClientRows, deleteRawScoped } from './scope.js'

/** Intuit's revocation_endpoint (developer.api.intuit.com/.well-known/openid_configuration). */
export const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

const DUE = `source = 'quickbooks' and status = 'revoked' and status_detail = 'owner_disconnect'`

type Outcome = 'revoked' | 'already_invalid' | null

/**
 * One client, one transaction. The token row stays locked (`for update skip locked`, as in
 * run.ts refreshOne) across the Intuit call and the deletes, so two ticks cannot both process it
 * and a reconnect (attach_source's upsert) waits until the delete commits, then inserts fresh.
 * Anything but a 200 or a 400 invalid_grant throws, rolling back: the row stays for next tick.
 */
async function revokeOne(t: Tick, clientId: string): Promise<Outcome> {
  return tx(async c => {
    const got = await c.query<{ secret: string; refresh_secret: string | null }>(
      `select secret, refresh_secret from data.source_tokens where client_id = $1 and ${DUE}
       for update skip locked`, [clientId])
    if (!got.rows.length) return null
    // A run claimed before the disconnect is still writing: deleting now would leave its later
    // inserts behind as orphans. Wait for the lease to end; next tick retries.
    const leased = await c.query(
      `select 1 from data.connector_schedule where client_id = $1 and source = 'quickbooks' and lease_until > now() for update`, [clientId])
    if (leased.rows.length) return null

    const id = envStr('QUICKBOOKS_CLIENT_ID'), secret = envStr('QUICKBOOKS_CLIENT_SECRET')
    // Without app credentials Intuit refuses the call; never delete without a real revoke.
    if (!id || !secret) throw new Error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET unset')

    const r = await t.fetch(INTUIT_REVOKE_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      },
      // Revoking the refresh token revokes the grant; the access token is the fallback.
      body: JSON.stringify({ token: got.rows[0].refresh_secret || got.rows[0].secret }),
      signal: AbortSignal.timeout(10_000),
    })
    let outcome: Outcome = 'revoked'
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      // Only 400 invalid_grant means the token is already dead. A 401 is invalid_client
      // (our app credentials), not the token: keep the row.
      if (r.status !== 400 || body?.error !== 'invalid_grant') throw new SourceError('quickbooks', reason(body, r.status), r.status, body)
      outcome = 'already_invalid'
    }

    await deleteRawScoped(c, clientId, 'quickbooks', { chunked: false })
    await deleteClientRows(c, clientId, { source: 'quickbooks' }) // incl. source_tokens, schedule, health
    return outcome
  })
}

/** Stuck a day or more: one alert per client per day (privacy.ts escalate()'s dedupe), keep retrying. */
async function alertIfStuck(clientId: string, error: string): Promise<void> {
  await sql(
    `insert into data.notifications (client_id, kind, dedupe_key, payload)
     select $1::uuid, 'quickbooks_revoke_stuck', 'quickbooks_revoke_stuck:' || $1 || ':' || current_date, $2::jsonb
     from data.source_tokens where client_id = $1::uuid and ${DUE} and updated_at < now() - interval '24 hours'
     on conflict (dedupe_key) do nothing`,
    [clientId, JSON.stringify({ error })])
}

export async function revokeDisconnected(t: Tick): Promise<number> {
  // ponytail: 50 per tick, sequential — owner disconnects are rare; batch if that changes.
  const due = await sql<{ client_id: string }>(`select client_id from data.source_tokens where ${DUE} limit 50`)
  let n = 0
  for (const { client_id } of due.rows) {
    try {
      const outcome = await revokeOne(t, client_id)
      if (!outcome) continue
      n++
      t.log('quickbooks_disconnected', { client: client_id, outcome })
    } catch (e) {
      const error = redact(e instanceof Error ? e.message : String(e))
      t.log('quickbooks_revoke_failed', { client: client_id, error })
      await alertIfStuck(client_id, error)
      // Network, timeout, 5xx, missing creds: Intuit (or we) are down for everyone, so stop
      // rather than spend 10s per client. A per-client 4xx moves on to the next client.
      if (!(e instanceof SourceError && e.status !== undefined && e.status < 500)) break
    }
  }
  return n
}
