// §5.5 health, §5.6 alerts + Resend delivery, §5.6 pooled-egress watch.
import { envNum, envStr, sql } from './db.js'
import type { Tick } from './db.js'
import { fullListEntities } from './connectors/index.js'

/** A delete of revoked sources' rows, then one upsert statement; `is distinct from` keeps status_since stable across ticks (§5.5). */
export async function computeHealth(_t: Tick): Promise<number> {
  // Heals a revoke that raced a tick: an uninstalled source must read Not connected.
  await sql(
    `delete from data.connector_health h using data.source_tokens tk
     where (tk.client_id, tk.source) = (h.client_id, h.source) and tk.status = 'revoked'`)
  const r = await sql(
    `with sched as (
       select s.client_id, s.source, s.interval, s.last_run_at, s.last_success_at, s.last_error,
              s.consecutive_failures, tk.status as token_status
       from data.connector_schedule s
       join data.clients c on c.id = s.client_id and c.status = 'active'
       left join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
       where tk.status is distinct from 'revoked'
     ), last_run as (
       select distinct on (client_id, source) client_id, source, status, entity_rows
       from data.connector_runs where finished_at is not null and mode <> 'renormalize'
       order by client_id, source, finished_at desc
     ), prev_ok as (
       select client_id, source, entity_rows from (
         select client_id, source, entity_rows,
                row_number() over (partition by client_id, source order by finished_at desc) as rn
         from data.connector_runs where finished_at is not null and status = 'ok' and mode <> 'renormalize'
       ) x where rn between 2 and 11
     ), zero_now as (
       -- §5.5: a full-list entity fetched 0 rows in the last ok run, after 10 ok runs that each fetched > 0
       select distinct lr.client_id, lr.source
       from last_run lr
       cross join jsonb_array_elements_text(coalesce($1::jsonb -> lr.source::text, '[]'::jsonb)) as e(entity)
       where lr.status = 'ok' and coalesce((lr.entity_rows ->> e.entity)::int, 0) = 0
         and (select count(*) from prev_ok p
              where (p.client_id, p.source) = (lr.client_id, lr.source)
                and coalesce((p.entity_rows ->> e.entity)::int, 0) > 0) = 10
     ), computed as (
       select s.client_id, s.source,
         (case
            when s.token_status = 'auth_failed' or lr.status = 'auth_failed' then 'auth_failed'
            when lr.client_id is null then 'never_ran'
            when s.last_success_at < now() - 3 * s.interval then 'stale'
            when z.client_id is not null then 'stale'
            when lr.status = 'error' and s.consecutive_failures >= 1 then 'error'
            else 'ok'
          end)::data.health_status as status,
         s.last_run_at, s.last_success_at, s.last_error
       from sched s
       left join last_run lr on (lr.client_id, lr.source) = (s.client_id, s.source)
       left join zero_now z on (z.client_id, z.source) = (s.client_id, s.source)
     )
     insert into data.connector_health as h (client_id, source, status, status_since, last_run_at, last_success_at, last_error)
     select client_id, source, status, now(), last_run_at, last_success_at,
            case when status in ('error','auth_failed','stale') then last_error else null end
     from computed
     on conflict (client_id, source) do update set
       status = excluded.status,
       status_since = case when h.status = excluded.status then h.status_since else excluded.status_since end,
       last_run_at = excluded.last_run_at, last_success_at = excluded.last_success_at,
       last_error = excluded.last_error, computed_at = now()
     where (h.status, h.last_error, h.last_success_at, h.last_run_at)
           is distinct from (excluded.status, excluded.last_error, excluded.last_success_at, excluded.last_run_at)`,
    [JSON.stringify(fullListEntities)])
  return r.rowCount ?? 0
}

// ------------------------------------------------------------------ §5.6

/** Raises the rows; delivery is a separate pass so a Resend outage only delays. */
export async function alerts(t: Tick): Promise<number> {
  const raised = await sql(
    `insert into data.notifications (client_id, kind, dedupe_key, payload)
     select h.client_id, 'auth_failed', 'auth_failed:' || h.client_id || ':' || h.source || ':' || h.status_since,
            jsonb_build_object('source', h.source::text, 'error', h.last_error)
     from data.connector_health h where h.status = 'auth_failed'
     union all
     select h.client_id, 'stale', 'stale:' || h.client_id || ':' || h.source || ':' || h.status_since::date,
            jsonb_build_object('source', h.source::text, 'since', h.status_since)
     from data.connector_health h where h.status = 'stale' and h.status_since < now() - interval '6 hours'
     union all
     select c.id, 'egress_client_quota',
            'egress_client:' || c.id || ':' || to_char(e.month, 'YYYY-MM'),
            jsonb_build_object('bytes', e.bytes, 'quota', c.egress_quota_bytes)
     from data.egress_ledger e join data.clients c on c.id = e.client_id
     where e.month = date_trunc('month', now() at time zone c.timezone)::date
       and e.bytes >= c.egress_quota_bytes
     on conflict (dedupe_key) do nothing`)
  const breaks = await raiseClientBreaks(t)
  await sendPending(t)
  return (raised.rowCount ?? 0) + breaks
}

// ------------------------------------------------------- client break emails

/** Hub home: the reconnect link in every client break email (no per-card anchor exists). */
const HUB_URL = 'https://connect.bcn-services.com/'
const STALE_GRACE_MS = 6 * 3600_000   // same grace as the bcns stale alert
const REMINDER_AFTER_MS = 3 * 86_400_000
// Mirrors the hub's labels (apps/connect); the worker cannot import the app.
const LABELS: Record<string, string> = {
  shopify: 'Shopify', meta: 'Meta Ads', monday: 'Monday.com', meet: 'Google Meet', drive: 'Google Drive', quickbooks: 'QuickBooks',
}
const labelOf = (source: string) => LABELS[source] ?? source

export interface BreakRow { client_id: string; source: string; status: string; status_since: Date; initial_sent_at: Date | null }
export interface BreakNotice { kind: 'client_break' | 'client_break_reminder'; client_id: string; dedupe_key: string; payload: { source: string; status: string; status_since: string } }

/** Stable per breakage: built from status_since (changes only on a status transition), never from the clock. */
export const breakKey = (kind: BreakNotice['kind'], r: Pick<BreakRow, 'client_id' | 'source' | 'status_since'>) =>
  `${kind}:${r.client_id}:${r.source}:${r.status_since.toISOString()}`

/** Pure: which client break rows a set of broken-source health rows calls for at `now`. */
export function clientBreakNotices(rows: BreakRow[], now: Date): BreakNotice[] {
  const out: BreakNotice[] = []
  for (const r of rows) {
    if (r.status !== 'auth_failed' && r.status !== 'stale') continue
    const payload = { source: r.source, status: r.status, status_since: r.status_since.toISOString() }
    const age = now.getTime() - r.status_since.getTime()
    if (r.status === 'auth_failed' || age > STALE_GRACE_MS) {
      out.push({ kind: 'client_break', client_id: r.client_id, dedupe_key: breakKey('client_break', r), payload })
    }
    // The reminder counts from when the first email was actually sent (null: unsent or no owner), so a long-broken source never gets both at once.
    if (r.initial_sent_at && now.getTime() - r.initial_sent_at.getTime() >= REMINDER_AFTER_MS) {
      out.push({ kind: 'client_break_reminder', client_id: r.client_id, dedupe_key: breakKey('client_break_reminder', r), payload })
    }
  }
  return out
}

/** Reads the broken sources of active clients, inserts the notices; the unique dedupe_key makes every tick after the first a no-op. */
async function raiseClientBreaks(t: Tick): Promise<number> {
  const h = await sql<Omit<BreakRow, 'initial_sent_at'>>(
    `select h.client_id, h.source::text as source, h.status::text as status, h.status_since
     from data.connector_health h join data.clients c on c.id = h.client_id and c.status = 'active'
     where h.status in ('auth_failed', 'stale')`)
  if (!h.rows.length) return 0
  // Unsent rows have sent_at null, so no reminder is counted until the first email has gone out.
  const first = await sql<{ dedupe_key: string; sent_at: Date | null }>(
    `select dedupe_key, sent_at from data.notifications where dedupe_key = any($1::text[])`,
    [h.rows.map(r => breakKey('client_break', r))])
  const createdAt = new Map(first.rows.map(r => [r.dedupe_key, r.sent_at]))
  const notices = clientBreakNotices(
    h.rows.map(r => ({ ...r, initial_sent_at: createdAt.get(breakKey('client_break', r)) ?? null })), t.now())
  let raised = 0
  for (const n of notices) {
    const r = await sql(
      `insert into data.notifications (client_id, kind, dedupe_key, payload) values ($1, $2, $3, $4::jsonb)
       on conflict (dedupe_key) do nothing`,
      [n.client_id, n.kind, n.dedupe_key, JSON.stringify(n.payload)])
    raised += r.rowCount ?? 0
  }
  return raised
}

/** Pure: owner-role, non-smoke, non-empty, deduped. Exported so the weekly digest reuses the same audience. */
export function ownerRecipients(rows: { email: string | null; role: string; is_smoke: boolean }[]): string[] {
  return [...new Set(rows.filter(r => r.role === 'owner' && !r.is_smoke && r.email).map(r => r.email!))]
}

export async function ownerEmails(clientId: string): Promise<string[]> {
  const r = await sql<{ email: string | null; role: string; is_smoke: boolean }>(
    `select u.email, m.role::text as role, m.is_smoke
     from data.memberships m join auth.users u on u.id = m.user_id where m.client_id = $1`, [clientId])
  return ownerRecipients(r.rows)
}

/** Pure plain-English copy; no tenant data beyond the source's label and a date. */
export function breakEmail(kind: BreakNotice['kind'], source: string, status: string, statusSince: Date): { subject: string; text: string } {
  const label = labelOf(source)
  const since = statusSince.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
  const problem = status === 'auth_failed'
    ? `We can't reach your ${label} account right now, so the information in your bcns Connect has stopped updating.`
    : `The ${label} information in your bcns Connect hasn't updated since ${since}.`
  const fix = status === 'auth_failed'
    ? 'Reconnecting fixes it, and your information picks up again on its own.'
    : "Reconnecting usually fixes it. If it doesn't, reply to this email and we'll sort it out."
  const lead = kind === 'client_break_reminder'
    ? `A quick reminder: ${label} is still not connected. ${problem}`
    : problem
  return {
    subject: kind === 'client_break_reminder' ? `Reminder: reconnect ${label}` : `Action needed: reconnect ${label}`,
    text: `Hi,\n\n${lead}\n\n${fix}\n\nReconnect ${label}: ${HUB_URL}\n\nThe bcns team\n`,
  }
}

/** One Resend batch call, one message per recipient so owners never see each other's address; Idempotency-Key makes a retry safe. Replies go to the bcns alert inbox, not the bot sender. */
export async function sendClientEmail(t: Tick, to: string[], subject: string, text: string, idempotencyKey: string): Promise<void> {
  const key = envStr('RESEND_API_KEY')
  const replyTo = envStr('BCNS_ALERT_EMAIL')
  const from = envStr('BCNS_ALERT_FROM') || replyTo
  if (!key || !from) throw new Error('RESEND_API_KEY and BCNS_ALERT_FROM or BCNS_ALERT_EMAIL are required to email clients')
  const r = await t.fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(to.map(addr => ({ from, to: [addr], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }))),
  })
  if (!r.ok) throw new Error(`resend HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

/** §5.6 step 9 — the pooled allowance is a platform-level number, so the row has no client. */
export async function egressPooled(_t: Tick): Promise<number> {
  const r = await sql(
    `insert into data.notifications (client_id, kind, dedupe_key, payload)
     select null, 'egress_pooled_80', 'egress_pooled:' || to_char(date_trunc('month', now())::date, 'YYYY-MM'),
            jsonb_build_object('bytes', sum(bytes), 'allowance', $1::bigint)
     from data.egress_ledger where month = date_trunc('month', now())::date
     having sum(bytes) >= 0.8 * $1::bigint
     on conflict (dedupe_key) do nothing`,
    [envNum('EGRESS_ALLOWANCE_BYTES', 268435456000)])
  return r.rowCount ?? 0
}

interface Pending { id: string; kind: string; dedupe_key: string; payload: Record<string, unknown>; client_id: string | null }

/** Every unsent row with attempts < 5, new or previously failed (R33). */
export async function sendPending(t: Tick): Promise<number> {
  const rows = await sql<Pending>(
    `select id, kind, dedupe_key, payload, client_id from data.notifications
     where sent_at is null and attempts < 5 order by created_at limit 50`)
  const key = envStr('RESEND_API_KEY'), to = envStr('BCNS_ALERT_EMAIL')
  let sent = 0
  for (const n of rows.rows) {
    let error: string | null = null
    try {
      if (n.kind === 'client_break' || n.kind === 'client_break_reminder') {
        const owners = n.client_id ? await ownerEmails(n.client_id) : []
        if (!owners.length) {
          await sql(`update data.notifications set sent_at = now(), last_error = 'no owner to email' where id = $1`, [n.id])
          continue
        }
        const p = n.payload as { source: string; status: string; status_since: string }
        const m = breakEmail(n.kind, p.source, p.status, new Date(p.status_since))
        await sendClientEmail(t, owners, m.subject, m.text, n.dedupe_key)
      } else {
        if (!key || !to) throw new Error('RESEND_API_KEY and BCNS_ALERT_EMAIL are required to send alerts')
        const r = await t.fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            from: envStr('BCNS_ALERT_FROM', to), to: [to],
            subject: `[bcns-data] ${n.kind}${n.client_id ? ` — ${n.client_id}` : ''}`,
            text: `${n.dedupe_key}\n\n${JSON.stringify(n.payload, null, 2)}`,
          }),
        })
        if (!r.ok) throw new Error(`resend HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    if (error) {
      await sql(`update data.notifications set attempts = attempts + 1, last_error = $2 where id = $1`, [n.id, error.slice(0, 500)])
    } else {
      await sql(`update data.notifications set sent_at = now() where id = $1`, [n.id])
      sent++
    }
  }
  // A row that exhausted its attempts is itself surfaced, else a Resend misconfiguration is silent.
  await sql(
    `insert into data.notifications (kind, dedupe_key, payload)
     select 'notifications_stuck', 'notifications_stuck:' || current_date, jsonb_build_object('count', count(*))
     from data.notifications where sent_at is null and attempts >= 5
     having count(*) > 0
     on conflict (dedupe_key) do nothing`)
  return sent
}
