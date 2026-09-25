// §4.7 QuickBooks Online — Purchase + Bill (money out), via the Query endpoint.
//
// No CDC: incremental is a plain `MetaData.LastUpdatedTime >=` query, same shape
// as a human would run in the QBO API Explorer. `>=` not `>`: LastUpdatedTime is
// one-second precision, so a row updated in the same second as the prior
// high-water mark, but written after that query's snapshot, would be skipped
// forever under a strict `>`. Re-querying the boundary row is harmless —
// writeRaw and upsertCanonical are both idempotent. minorversion=75 is the
// floor — 1-74 were deprecated 2025-08-01 (Intuit's own migration notice).
//
// Access tokens live 60 minutes. Refresh tokens rotate roughly every 24-26
// hours (Intuit changed this from "every use" in Nov 2025) and, with regular
// use, are now valid up to 5 years (was a fixed 100 days) — either way the
// rule is the same: always store the LATEST refresh_token returned, so
// refreshToken() below always persists whatever comes back — unlike
// drive/meet (Google never rotates) it throws if one is missing, because
// silently keeping a stale refresh token bricks the connection with no
// reconnect prompt until the next tick's 401.
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type Json, type Page, type RawRow, type RecordRow, type RunContext,
  SourceError, reason,
} from './index.js'
import { envStr } from '../db.js'

const PAGE = 1000
const MINORVERSION = 75
/** Purchase = a direct expense (cash/card/check); Bill = an accounts-payable bill. Nothing else is money out. */
const ENTITIES = ['Purchase', 'Bill'] as const
type Entity = (typeof ENTITIES)[number]

const configSchema = z.object({
  realm_id: z.string().regex(/^[0-9]{1,32}$/),
}).passthrough()

/** Sandbox vs production host; QUICKBOOKS_ENV defaults to sandbox so a missing env var fails safe. */
export function baseUrl(): string {
  return envStr('QUICKBOOKS_ENV', 'sandbox') === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}

/** `'YYYY-MM-DD'`, matching what TxnDate compares against. */
const fmtDate = (d: Date): string => d.toISOString().slice(0, 10)

export function buildQuery(entity: Entity, where: string, start: number): string {
  return `select * from ${entity} where ${where} orderby Id startposition ${start} maxresults ${PAGE}`
}

async function runQuery(ctx: RunContext, entity: Entity, where: string, start: number): Promise<Json[]> {
  const realmId = ctx.config.realm_id
  const query = buildQuery(entity, where, start)
  const url = `${baseUrl()}/v3/company/${realmId}/query?${new URLSearchParams({ query, minorversion: String(MINORVERSION) })}`
  const r = await ctx.fetch(url, { headers: { Authorization: `Bearer ${ctx.token.secret}`, Accept: 'application/json' } })
  const body: Json = await r.json().catch(() => ({}))
  if (!r.ok) throw new SourceError('quickbooks', reason(body, r.status), r.status, body)
  return body?.QueryResponse?.[entity] ?? []
}

interface QBCursor { entity?: Entity; start?: number; last_updated?: string }

async function* pull(ctx: RunContext, mode: 'backfill' | 'incremental', from: Date | null, start0: QBCursor | null): AsyncGenerator<Page> {
  const cursors: Record<string, Json> = (start0 as unknown as Record<string, Json>) ?? {}
  const runStartMs = Date.now()

  for (let i = 0; i < ENTITIES.length; i++) {
    const entity = ENTITIES[i]
    const prior: QBCursor | undefined = mode === 'backfill'
      ? (start0?.entity === entity ? start0 : undefined)
      : (cursors[entity] as QBCursor | undefined)
    let start = prior?.start ?? 1
    let maxSeenMs = 0

    for (;;) {
      const where = mode === 'backfill'
        ? `TxnDate >= '${fmtDate(from!)}'`
        : `MetaData.LastUpdatedTime >= '${prior?.last_updated ?? new Date(0).toISOString()}'`
      const rows = await runQuery(ctx, entity, where, start)
      const raw: RawRow[] = rows.map((o: Json) => {
        const updated = o?.MetaData?.LastUpdatedTime ? new Date(o.MetaData.LastUpdatedTime) : undefined
        if (updated && updated.getTime() > maxSeenMs) maxSeenMs = updated.getTime()
        return { entity, externalId: String(o.Id), sourceUpdatedAt: updated, payload: o }
      })

      const entityDone = rows.length < PAGE
      const lastEntity = i === ENTITIES.length - 1
      const done = entityDone && lastEntity

      const lastUpdatedIso = () => {
        const prevMs = prior?.last_updated ? new Date(prior.last_updated).getTime() : 0
        const finalMs = mode === 'backfill' ? (maxSeenMs || runStartMs) : Math.max(maxSeenMs, prevMs) || runStartMs
        return new Date(finalMs).toISOString()
      }

      const cursor: Json = done
        ? { last_updated: lastUpdatedIso() }
        : entityDone
          ? { entity: ENTITIES[i + 1], start: 1 }
          : { entity, start: start + PAGE }

      yield { raw, entity, cursor, entityDone, done }
      if (done) return
      if (entityDone) break
      start += PAGE
    }
  }
}

/** Decimal string/number → integer cents, no float multiply (banker's-safe for QBO's decimal-string TotalAmt).
 * `.slice(0, 2)` truncates a 3rd decimal digit rather than rounding, but QBO's TotalAmt never emits more than 2. */
export function amountCents(amount: unknown): number {
  const s = String(amount ?? '0')
  const neg = s.startsWith('-')
  const abs = neg ? s.slice(1) : s
  const [wholeRaw, fracRaw = ''] = abs.split('.')
  const whole = wholeRaw || '0'
  const frac = (fracRaw + '00').slice(0, 2)
  const n = parseInt(`${whole}${frac}`, 10) || 0
  return neg ? -n : n
}

function lineAccounts(line: Json[]): { accounts: string[]; account: string | null } {
  const names = (line ?? [])
    .map((l: Json) => l?.AccountBasedExpenseLineDetail?.AccountRef?.name)
    .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
  return { accounts: [...new Set(names)], account: names[0] ?? null }
}

export const quickbooks: Connector = {
  source: 'quickbooks',
  defaults: {
    interval: '1 hour',
    backfillDepth: '24 months',
    rateLimit: { concurrency: 2, minDelayMs: 500 }, // 500/min per realm, 10 concurrent per app — well inside both
  },
  configSchema,
  tokenKind: 'quickbooks_oauth_refresh',

  backfill(ctx, from, cursor) { return pull(ctx, 'backfill', from, cursor as QBCursor | null) },
  incremental(ctx, cursors) { return pull(ctx, 'incremental', null, cursors as unknown as QBCursor) },

  /**
   * Intuit rotates the refresh token roughly every 24-26 hours (not strictly
   * per-use as of Nov 2025's policy change). Unlike Google (drive.ts/meet.ts),
   * a missing one here is not "this source doesn't rotate" — it means the
   * token endpoint returned something unexpected, so refreshOne's caller must
   * NOT coalesce onto the now-stale stored token.
   */
  async refreshToken(ctx): Promise<{ secret: string; expiresAt: Date; refreshSecret: string }> {
    const clientId = envStr('QUICKBOOKS_CLIENT_ID')
    const clientSecret = envStr('QUICKBOOKS_CLIENT_SECRET')
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const r = await ctx.fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: ctx.token.refresh_secret ?? '' }).toString(),
    })
    const b: Json = await r.json().catch(() => ({}))
    if (!r.ok || b.error) throw new SourceError('quickbooks', String(b.error_description ?? b.error ?? `HTTP ${r.status}`), r.status, b)
    if (typeof b.refresh_token !== 'string' || !b.refresh_token) {
      throw new SourceError('quickbooks', 'refresh response carried no refresh_token', r.status, b)
    }
    return {
      secret: String(b.access_token),
      expiresAt: new Date(Date.now() + Number(b.expires_in ?? 3600) * 1000),
      refreshSecret: b.refresh_token,
    }
  },

  normalize(_ctx: RunContext, rows: RawRow[]): CanonicalWrites {
    const records: RecordRow[] = []
    for (const r of rows) {
      // Defense in depth: pull() only ever queries Purchase/Bill, but normalize
      // is independently testable and must not canonicalize anything else
      // (e.g. a BillPayment) that a future entity list or hand-built row carries.
      if (r.entity !== 'Purchase' && r.entity !== 'Bill') continue
      const o = r.payload
      const { accounts, account } = lineAccounts(o.Line ?? [])
      const isBill = r.entity === 'Bill'
      const vendor = isBill ? (o.VendorRef?.name ?? null) : (o.EntityRef?.name ?? null)
      // Purchase.Credit: QBO reports TotalAmt as a positive magnitude even when the
      // transaction is a vendor refund (money IN); Bill has no Credit field. Negate
      // so the records contract's "negative for credits" holds regardless of source.
      const credit = o.Credit === true
      const magnitude = amountCents(o.TotalAmt)
      records.push({
        externalId: `${r.entity}:${o.Id}`,
        kind: 'qbo_expense',
        occurred_at: o.TxnDate ? new Date(o.TxnDate).toISOString() : new Date().toISOString(),
        attributes: {
          date: o.TxnDate ?? null,
          amount_cents: credit ? -magnitude : magnitude,
          currency: o.CurrencyRef?.value ?? 'USD',
          vendor,
          memo: o.PrivateNote ?? null,
          account,
          accounts,
          txn_type: r.entity,
          payment_type: isBill ? null : (o.PaymentType ?? null),
          credit,
        },
        source_updated_at: o.MetaData?.LastUpdatedTime ?? null,
      })
    }
    return { records }
  },
}
