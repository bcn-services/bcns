// §5.5 health, §5.6 alerts + Resend delivery, §5.6 pooled-egress watch.
import { envNum, envStr, sql } from './db.js'
import type { Tick } from './db.js'
import { fullListEntities } from './connectors/index.js'

/** One statement; `is distinct from` keeps status_since stable across ticks (§5.5). */
export async function computeHealth(_t: Tick): Promise<number> {
  const r = await sql(
    `with sched as (
       select s.client_id, s.source, s.interval, s.last_run_at, s.last_success_at, s.last_error,
              s.consecutive_failures, tk.status as token_status
       from data.connector_schedule s
       join data.clients c on c.id = s.client_id and c.status = 'active'
       left join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
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
  await sendPending(t)
  return raised.rowCount ?? 0
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
