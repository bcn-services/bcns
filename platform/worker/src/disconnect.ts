// Owner-initiated disconnect, worker half, for quickbooks, meet, drive, monday and meta.
// api.disconnect_source (migrations 20261002000100, 20261007000500) marks the token 'revoked' /
// 'owner_disconnect'; this housekeeping step revokes it upstream (revokeUpstream) and then deletes
// that source's token row, schedule, health row and data for the client. Shopify is never here:
// its uninstall flow owns it.
//
// Only status_detail 'owner_disconnect' rows: a row an operator revoked by hand is never
// auto-deleted. Never logs the token: only client id, source, outcome, and redact()ed error text.
import { envStr, sql, storage, tx, type Tick } from './db.js'
import { SourceError, reason, redact } from './connectors/index.js'
import { deleteClientRows, deleteRawScoped } from './scope.js'

/** Sources an owner can disconnect. Mirrors api.disconnect_source's allow-list and the hub's DISCONNECTABLE. */
export const DISCONNECT_SOURCES = ['quickbooks', 'meet', 'drive', 'monday', 'meta'] as const
export type DisconnectSource = (typeof DISCONNECT_SOURCES)[number]

/** Intuit's revocation_endpoint (developer.api.intuit.com/.well-known/openid_configuration). */
export const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
/** Google's OAuth 2.0 revocation endpoint: revokes the whole grant for that account + app. */
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
/** Same Graph version as connectors/meta.ts (its GRAPH const is not exported; connectors are read-only). */
export const META_PERMISSIONS_URL = 'https://graph.facebook.com/v21.0/me/permissions'

const DUE = `source in ('quickbooks', 'meet', 'drive', 'monday', 'meta') and status = 'revoked' and status_detail = 'owner_disconnect'`

export type Revoke = 'revoked' | 'already_invalid' | 'none'
export type Outcome = Revoke | 'kept_for_sibling'

export interface RevokeEnv { QUICKBOOKS_CLIENT_ID?: string; QUICKBOOKS_CLIENT_SECRET?: string }

/**
 * The upstream revoke for one token, no database. 'revoked' on success, 'already_invalid' when the
 * provider says the token is already dead, 'none' for Monday (no revoke endpoint). Anything else
 * throws, so the caller keeps the row and retries next tick.
 */
export async function revokeUpstream(
  fetchFn: typeof fetch, source: DisconnectSource,
  token: { secret: string; refresh_secret: string | null }, env: RevokeEnv,
): Promise<Revoke> {
  const signal = AbortSignal.timeout(10_000)
  // Revoking the refresh token revokes the grant; the access token is the fallback.
  const grant = token.refresh_secret || token.secret
  switch (source) {
    case 'monday':
      return 'none'
    case 'quickbooks': {
      const id = env.QUICKBOOKS_CLIENT_ID, secret = env.QUICKBOOKS_CLIENT_SECRET
      // Without app credentials Intuit refuses the call; never delete without a real revoke.
      if (!id || !secret) throw new Error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET unset')
      const r = await fetchFn(INTUIT_REVOKE_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        },
        body: JSON.stringify({ token: grant }),
        signal,
      })
      if (r.ok) return 'revoked'
      const body = await r.json().catch(() => ({}))
      // Only 400 invalid_grant means the token is already dead. A 401 is invalid_client
      // (our app credentials), not the token: keep the row.
      if (r.status === 400 && body?.error === 'invalid_grant') return 'already_invalid'
      throw new SourceError('quickbooks', reason(body, r.status), r.status, body)
    }
    case 'meet':
    case 'drive': {
      const r = await fetchFn(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: grant }).toString(),
        signal,
      })
      if (r.ok) return 'revoked'
      const body = await r.json().catch(() => ({}))
      // Google answers 400 invalid_token for a token that is already revoked or expired.
      if (r.status === 400 && body?.error === 'invalid_token') return 'already_invalid'
      throw new SourceError(source, reason(body, r.status), r.status, body)
    }
    case 'meta': {
      const url = `${META_PERMISSIONS_URL}?access_token=${encodeURIComponent(token.secret)}`
      const r = await fetchFn(url, { method: 'DELETE', signal })
      const body = await r.json().catch(() => ({}))
      if (r.ok && body?.success !== false) return 'revoked'
      // OAuthException code 190: the user token is expired or invalidated already.
      if (body?.error?.code === 190) return 'already_invalid'
      throw new SourceError('meta', reason(body, r.status), r.status, body)
    }
  }
}

/**
 * meet and drive hold separate token rows on the same Google app, and Google's revoke removes
 * the app's whole grant for that account. Revoke unless the other Google source is live: its
 * token 'active' or 'auth_failed' (when it keeps a health row, so the hub's card reads connected:
 * apps/connect/lib/sources.ts googleSiblingConnected). A revoked sibling, for any
 * reason, does not keep the grant.
 * ponytail: decided per client, not per Google account — a sibling connected with a different
 * Google account is also spared the revoke (its own grant stays until it is disconnected too).
 */
export function googleRevokeNeeded(sibling: { status: string } | null | undefined): boolean {
  return !sibling || (sibling.status !== 'active' && sibling.status !== 'auth_failed')
}

const GOOGLE_SIBLING: Partial<Record<DisconnectSource, DisconnectSource>> = { meet: 'drive', drive: 'meet' }

/** Which upstream a failure belongs to: one provider down must not hold up the others. */
const PROVIDER: Record<DisconnectSource, string> = {
  quickbooks: 'intuit', meet: 'google', drive: 'google', meta: 'meta', monday: 'monday',
}

/**
 * One client+source, one transaction. The token row stays locked (`for update skip locked`, as in
 * run.ts refreshOne) across the upstream call and the deletes, so two ticks cannot both process it
 * and a reconnect (attach_source's upsert) waits until the delete commits, then inserts fresh.
 * meet/drive lock the other Google row in the same statement, so two overlapping runs (one on
 * meet, one on drive) never each hold one row and wait on the other. A thrown revoke rolls back:
 * the row stays for next tick.
 */
async function revokeOne(t: Tick, clientId: string, source: DisconnectSource): Promise<{ outcome: Outcome; paths: string[] } | null> {
  return tx(async c => {
    const sibling = GOOGLE_SIBLING[source] ?? null
    // Own row only while due; the sibling in any state. Locked so a sibling reconnect waits.
    const got = await c.query<{ source: string; status: string }>(
      `select source, status from data.source_tokens
       where client_id = $1 and ((source = $2 and ${DUE}) or source = $3)
       order by source for update skip locked`, [clientId, source, sibling])
    if (!got.rows.some(r => r.source === source)) return null
    const sib = got.rows.find(r => r.source === sibling)
    // A sibling row that exists but was skipped is held by another transaction (a reconnect, or a
    // run on it): its state is not settled, so decide next tick.
    if (sibling && !sib && (await c.query(
      `select 1 from data.source_tokens where client_id = $1 and source = $2`, [clientId, sibling])).rows.length) return null
    // A run claimed before the disconnect is still writing: deleting now would leave its later
    // inserts behind as orphans. Wait for the lease to end; next tick retries.
    const leased = await c.query(
      `select 1 from data.connector_schedule where client_id = $1 and source = $2 and lease_until > now() for update`, [clientId, source])
    if (leased.rows.length) return null

    let outcome: Outcome
    if (sibling && !googleRevokeNeeded(sib)) outcome = 'kept_for_sibling'
    else {
      const token = (await c.query<{ secret: string; refresh_secret: string | null }>(
        `select secret, refresh_secret from data.source_tokens where client_id = $1 and source = $2`, [clientId, source])).rows[0]
      outcome = await revokeUpstream(t.fetch, source, token, {
        QUICKBOOKS_CLIENT_ID: envStr('QUICKBOOKS_CLIENT_ID'), QUICKBOOKS_CLIENT_SECRET: envStr('QUICKBOOKS_CLIENT_SECRET'),
      })
    }

    // Stored files (Meta downloads, Drive thumbnails) go once the rows are gone: see revokeDisconnected.
    const files = await c.query<{ storage_path: string | null; thumb_path: string | null }>(
      `select storage_path, thumb_path from data.media where client_id = $1 and source = $2`, [clientId, source])
    const paths = files.rows.flatMap(m => [m.storage_path, m.thumb_path].filter((p): p is string => !!p))

    await deleteRawScoped(c, clientId, source, { chunked: false })
    await deleteClientRows(c, clientId, { source }) // incl. source_tokens, schedule, health, media
    return { outcome, paths }
  })
}

/** Stuck a day or more: one alert per client+source per day (privacy.ts escalate()'s dedupe), keep retrying. */
async function alertIfStuck(clientId: string, source: DisconnectSource, error: string): Promise<void> {
  await sql(
    `insert into data.notifications (client_id, kind, dedupe_key, payload)
     select $1::uuid, $2 || '_revoke_stuck', $2 || '_revoke_stuck:' || $1 || ':' || current_date, $3::jsonb
     from data.source_tokens where client_id = $1::uuid and source = $2::data.source and ${DUE}
       and updated_at < now() - interval '24 hours'
     on conflict (dedupe_key) do nothing`,
    [clientId, source, JSON.stringify({ error })])
}

/**
 * After commit, best effort: never throws, so a storage hiccup is not read as a failed revoke.
 * ponytail: a failed remove leaves orig/ files to purge()'s orphan sweep but thumbnails behind;
 * sweep thumb/ orphans too if this ever logs.
 */
async function removeFiles(t: Tick, client: string, source: DisconnectSource, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 1000) {
    try {
      const r = await storage().remove(paths.slice(i, i + 1000))
      if (r.error) throw r.error
    } catch (e) {
      t.log(`${source}_storage_cleanup_failed`, { client, source, error: redact(e instanceof Error ? e.message : String(e)) })
      return
    }
  }
}

export async function revokeDisconnected(t: Tick): Promise<number> {
  // ponytail: 50 per tick, sequential — owner disconnects are rare; batch if that changes.
  const due = await sql<{ client_id: string; source: DisconnectSource }>(
    `select client_id, source from data.source_tokens where ${DUE} order by client_id, source limit 50`)
  const down = new Set<string>()
  let n = 0
  for (const { client_id, source } of due.rows) {
    if (down.has(PROVIDER[source])) continue
    try {
      const done = await revokeOne(t, client_id, source)
      if (!done) continue
      n++
      t.log(`${source}_disconnected`, { client: client_id, source, outcome: done.outcome })
      await removeFiles(t, client_id, source, done.paths)
    } catch (e) {
      const error = redact(e instanceof Error ? e.message : String(e))
      t.log(`${source}_revoke_failed`, { client: client_id, source, error })
      await alertIfStuck(client_id, source, error)
      // Network, timeout, 5xx, missing creds: that provider (or we) are down for everyone, so skip
      // its remaining rows this tick rather than spend 10s on each. A per-client 4xx moves on.
      if (!(e instanceof SourceError && e.status !== undefined && e.status < 500)) down.add(PROVIDER[source])
    }
  }
  return n
}
