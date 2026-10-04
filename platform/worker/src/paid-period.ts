// Shopify: access ends when a paid period ends (migration 20261002000100).
//
// /finish lets a reinstall through when the store has no ACTIVE subscription but already paid
// for a period that has not ended, and stores that period's end in data.shopify_paid_through.
// This housekeeping step re-checks a row once its date has passed, at most about once a day,
// with the merchant's own stored token (the same Admin query /finish makes; no Partner
// credential, no new secret):
//   - an ACTIVE subscription            -> store its new period end, keep access
//   - an empty list, past date + skew   -> data.revoke_shopify_install (the uninstall state)
//   - anything else                     -> keep access, log, try again next day
// Public-app rows only: never the bridge app (config.app / BRIDGE_SHOP). Never logs a token.
import { sql } from './db.js'
import type { Tick } from './db.js'
import { shopifyEndpoint } from './connectors/shopify-url.js'
import { BRIDGE_SHOP } from './privacy.js'
import { contextFor } from './run.js'

/** Our clock against Shopify's: a period is over only this long after its stored end. */
export const SKEW_MS = 60 * 60 * 1000

const QUERY = 'query{currentAppInstallation{activeSubscriptions{status currentPeriodEnd}}}'
/** An ISO timestamp with an explicit zone; Date.parse reads a zone-less one as local time. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export type SubscriptionAnswer =
  | { kind: 'active'; periodEnd: string | null }
  /** Shopify answered, cleanly, with no subscription at all. The only answer that can end access. */
  | { kind: 'none' }
  | { kind: 'unknown'; reason: string }

export type Decision =
  | { action: 'extend'; until: string }
  | { action: 'revoke' }
  | { action: 'keep'; reason: string }

/** sb-bridge: remove after SB migrates to bcns Connect. Shop checked too, as privacy.ts does. */
export function isPublicApp(shop: string, config: { app?: unknown } | null): boolean {
  return (config?.app ?? null) === null && shop.toLowerCase() !== BRIDGE_SHOP
}

/** Shopify's response -> an answer. Pure. Anything not clearly ACTIVE or clearly empty is unknown. */
export function readSubscriptions(status: number, body: unknown): SubscriptionAnswer {
  if (status < 200 || status >= 300) return { kind: 'unknown', reason: `http_${status}` }
  const b = body as { data?: { currentAppInstallation?: { activeSubscriptions?: unknown } }; errors?: unknown } | null
  if (!b || (Array.isArray(b.errors) && b.errors.length)) return { kind: 'unknown', reason: 'graphql_error' }
  const subs = b.data?.currentAppInstallation?.activeSubscriptions
  if (!Array.isArray(subs)) return { kind: 'unknown', reason: 'malformed' }
  if (subs.length === 0) return { kind: 'none' }
  const active = subs.find((s) => (s as { status?: unknown })?.status === 'ACTIVE') as { currentPeriodEnd?: unknown } | undefined
  if (!active) return { kind: 'unknown', reason: 'no_active_status' }
  const end = active.currentPeriodEnd
  return { kind: 'active', periodEnd: typeof end === 'string' && ISO_WITH_ZONE.test(end) ? end : null }
}

/** The whole decision, pure. Revoke only on a definitive empty list after the stored date plus skew. */
export function decide(paidThrough: Date | null, answer: SubscriptionAnswer, now: Date): Decision {
  if (answer.kind === 'unknown') return { action: 'keep', reason: answer.reason }
  if (answer.kind === 'active') {
    const end = answer.periodEnd ? Date.parse(answer.periodEnd) : NaN
    return end > now.getTime() ? { action: 'extend', until: new Date(end).toISOString() } : { action: 'keep', reason: 'active_no_period_end' }
  }
  const through = paidThrough?.getTime() ?? NaN
  if (Number.isNaN(through)) return { action: 'keep', reason: 'no_date' }
  if (now.getTime() <= through + SKEW_MS) return { action: 'keep', reason: 'within_skew' }
  return { action: 'revoke' }
}

/** One Admin call with the merchant's token. Never throws. */
export async function checkSubscription(fetchImpl: typeof fetch, shop: string, token: string): Promise<SubscriptionAnswer> {
  try {
    const r = await fetchImpl(shopifyEndpoint(shop), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(10_000),
    })
    return readSubscriptions(r.status, await r.json().catch(() => null))
  } catch (e) {
    return { kind: 'unknown', reason: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network_error' }
  }
}

interface DueRow {
  client_id: string
  shop: string
  config: { app?: unknown } | null
  paid_through: Date | null
  checked_from: Date
}

/** Returns how many connections it revoked. */
export async function paidPeriods(t: Tick): Promise<number> {
  // ponytail: 50 rows a day, sequential; page it if paid-period reinstalls ever outnumber that.
  const due = await sql<DueRow>(
    `select p.client_id, p.shop, s.config, p.paid_through, now() as checked_from
       from data.shopify_paid_through p
       join data.connector_schedule s on s.client_id = p.client_id and s.source = 'shopify'
                                      and lower(s.config->>'shop') = lower(p.shop)
       join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
      where s.enabled and tk.status = 'active' and p.paid_through < now()
        -- Bridge rows out in SQL so they never hold a LIMIT slot; isPublicApp below is the second guard.
        and s.config->>'app' is null and lower(p.shop) <> $1
        and (p.checked_at is null or p.checked_at < now() - interval '20 hours')
      order by p.paid_through limit 50`, [BRIDGE_SHOP])
  let revoked = 0
  for (const row of due.rows) {
    if (!isPublicApp(row.shop, row.config)) continue
    try {
      // The worker's own context: the stored (housekeeping-refreshed) token and the rate-limited fetch.
      const ctx = await contextFor(t, row.client_id, 'shopify')
      const answer = await checkSubscription(ctx.fetch, row.shop, ctx.token.secret)
      const d = decide(row.paid_through, answer, row.checked_from)
      await sql(
        `update data.shopify_paid_through set checked_at = now(), paid_through = coalesce($2::timestamptz, paid_through) where client_id = $1`,
        [row.client_id, d.action === 'extend' ? d.until : null])
      if (d.action === 'revoke') {
        // checked_from, not now(): a reinstall or token refresh after the check began is newer
        // and revoke_shopify_install leaves it alone (fail open; re-checked tomorrow).
        const r = await sql<{ n: number }>(`select data.revoke_shopify_install($1, $2) as n`, [row.shop, row.checked_from])
        revoked += r.rows[0]?.n ?? 0
      }
      t.log('paid_period', { client: row.client_id, shop: row.shop, ...d })
    } catch (e) {
      // Fail open: nothing revoked. checked_at is (re)set here too, so a row whose check keeps
      // throwing (e.g. contextFor's config parse) is retried in ~20 h, not every tick.
      t.log('paid_period_failed', { client: row.client_id, shop: row.shop, error: e instanceof Error ? e.message : String(e) })
      await sql(`update data.shopify_paid_through set checked_at = now() where client_id = $1`, [row.client_id]).catch(() => {})
    }
  }
  return revoked
}
