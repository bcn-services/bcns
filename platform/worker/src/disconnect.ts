// Owner-initiated QuickBooks disconnect, worker half. api.disconnect_source (migration
// 20261002000100) marks the token 'revoked'; this housekeeping step revokes it at Intuit and
// then deletes the token row, schedule, health row and the client's QuickBooks data.
//
// Never logs the token: only client id, outcome, and redact()ed error text.
import { envStr, sql, tx, type Tick } from './db.js'
import { SourceError, classify, reason, redact } from './connectors/index.js'
import { deleteClientRows, deleteRawScoped } from './scope.js'

/** Intuit's revocation_endpoint (developer.api.intuit.com/.well-known/openid_configuration). */
export const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

type Outcome = 'revoked' | 'already_invalid' | null

/**
 * One client, one transaction. The token row stays locked (`for update skip locked`, as in
 * run.ts refreshOne) across the Intuit call and the deletes, so two ticks cannot both process it
 * and a reconnect (attach_source's upsert) waits until the delete commits, then inserts fresh.
 * A transient failure (5xx, network, timeout) throws, rolling back: the row stays for next tick.
 */
async function revokeOne(t: Tick, clientId: string): Promise<Outcome> {
  return tx(async c => {
    const got = await c.query<{ secret: string; refresh_secret: string | null }>(
      `select secret, refresh_secret from data.source_tokens
       where client_id = $1 and source = 'quickbooks' and status = 'revoked' for update skip locked`, [clientId])
    if (!got.rows.length) return null

    const id = envStr('QUICKBOOKS_CLIENT_ID'), secret = envStr('QUICKBOOKS_CLIENT_SECRET')
    // Without app credentials Intuit answers 401, which would read as "already invalid" and
    // delete the row without ever revoking the grant.
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
      const e = new SourceError('quickbooks', reason(body, r.status), r.status, body)
      // 401 / invalid_grant: the token is already dead at Intuit, nothing left to revoke.
      if (classify(e) !== 'auth') throw e
      outcome = 'already_invalid'
    }

    await deleteRawScoped(c, clientId, 'quickbooks', { chunked: false })
    await deleteClientRows(c, clientId, { source: 'quickbooks' }) // incl. source_tokens, schedule, health
    return outcome
  })
}

export async function revokeDisconnected(t: Tick): Promise<number> {
  // ponytail: 50 per tick, sequential — owner disconnects are rare; batch if that changes.
  const due = await sql<{ client_id: string }>(
    `select client_id from data.source_tokens where source = 'quickbooks' and status = 'revoked' limit 50`)
  let n = 0
  for (const { client_id } of due.rows) {
    try {
      const outcome = await revokeOne(t, client_id)
      if (!outcome) continue
      n++
      t.log('quickbooks_disconnected', { client: client_id, outcome })
    } catch (e) {
      t.log('quickbooks_revoke_failed', { client: client_id, error: redact(e instanceof Error ? e.message : String(e)) })
    }
  }
  return n
}
