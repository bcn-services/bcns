// The only module in HQ's jobs that writes SQL. Only what source and qualify call.
//
// The Postgres client is always passed in. Nothing here opens a connection.
// Jobs connect as the pooler's postgres role, so RLS does not apply; the
// suppressed_at filter is explicit on every business read.
//
// `research` is jsonb. Always write it as a real object (sql.json): stringifying
// it into a jsonb param is how ~7k legacy rows ended up double-encoded (a jsonb
// string holding JSON). Reads can still return either shape; jobs/qualify.mjs
// parseResearch tolerates both, and the generated `fit_score` column does too.

export function businessByPlaceId(sql, placeId) {
  return sql`select id from businesses where place_id = ${placeId} limit 1`;
}

export function sourcedBacklog(sql, { limit = 25 } = {}) {
  return sql`
    select * from businesses
    where stage = 'sourced' and suppressed_at is null
    order by updated_at asc
    limit ${limit}
  `;
}

// Sourcing inserts in bulk and re-runs the same grid cell, so a repeat hit on
// place_id is expected, not an error.
export function insertBusinesses(sql, rows) {
  if (!rows.length) return Promise.resolve([]);
  const prepared = rows.map((r) => ({ ...r, research: sql.json(r.research ?? {}) }));
  return sql`
    insert into businesses ${sql(prepared, ...Object.keys(prepared[0]))}
    on conflict (place_id) where place_id is not null do nothing
    returning id
  `;
}

export function updateBusiness(sql, id, patch) {
  const p = "research" in patch ? { ...patch, research: sql.json(patch.research ?? {}) } : patch;
  return sql`
    update businesses set ${sql(p, ...Object.keys(p))}, updated_at = now()
    where id = ${id}
    returning id
  `;
}

// Every event a job writes is via='job' (0027: ui | mcp | job).
export function logEvent(sql, job, kind, detail = {}) {
  return sql`
    insert into events (job, kind, detail, via)
    values (${job}, ${kind}, ${sql.json(detail ?? {})}, 'job')
    returning id
  `;
}

// --- search grid -----------------------------------------------------------
// lib/grid.mjs owns which cells exist; this table only holds their run state.
// Upserting on every run means adding a town there needs no migration.

export function upsertCells(sql, cells) {
  if (!cells.length) return Promise.resolve([]);
  return sql`
    insert into search_grid ${sql(cells, "trade", "town", "state")}
    on conflict (trade, town, state) do nothing
    returning id
  `;
}

export function allCells(sql) {
  return sql`select * from search_grid`;
}

export function saveCell(sql, cell) {
  return sql`
    update search_grid
    set last_run_at = ${cell.last_run_at ?? null},
        new_rows_last_run = ${cell.new_rows_last_run ?? null},
        exhausted_at = ${cell.exhausted_at ?? null}
    where trade = ${cell.trade} and town = ${cell.town} and state = ${cell.state}
    returning id
  `;
}

// --- promotion -------------------------------------------------------------
// Best fit first, off the generated businesses.fit_score column (handles both
// research encodings). A row with no phone has nothing to dial and burns a
// daily slot, so it is never promoted. next_touch_at = now() makes it due.
export function promoteQualified(sql, { limit = 50 } = {}) {
  return sql`
    with candidates as (
      select id from businesses
      where stage = 'qualified' and suppressed_at is null and coalesce(trim(phone), '') <> ''
      order by fit_score desc nulls last, created_at asc
      limit ${limit}
    )
    update businesses set stage = 'call_due', next_touch_at = now(), updated_at = now()
    where id in (select id from candidates)
    returning id
  `;
}

// Promotions so far today (UTC), counted from the events promote wrote.
export function promotedToday(sql) {
  return sql`
    select count(*)::int as count from events
    where job = 'qualify' and kind = 'promoted'
      and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  `;
}

// --- deliverables ----------------------------------------------------------
// One queued row at a time. `for update skip locked` in the subselect means a
// second runner (a manual start beside the timer) gets the next row or none,
// never the same one. Moves it to running in the same statement.
export function claimDeliverable(sql) {
  return sql`
    update deliverables set status = 'running', started_at = now()
    where id = (
      select id from deliverables where status = 'queued'
      order by created_at for update skip locked limit 1
    )
    returning *
  `;
}

// A run is killed (OOM, reboot) leaves its row `running`; the unit's hard stop is
// 25 min, so anything older than 30 is dead.
export function failStaleDeliverables(sql) {
  return sql`
    update deliverables
    set status = 'failed', error = 'stale run', finished_at = now()
    where status = 'running' and started_at < now() - interval '30 minutes'
    returning id
  `;
}

export function otherRunning(sql, id) {
  return sql`select id from deliverables where status = 'running' and id <> ${id} limit 1`;
}

export function requeueDeliverable(sql, id) {
  return sql`
    update deliverables set status = 'queued', started_at = null
    where id = ${id} and status = 'running'
    returning id
  `;
}

export function finishDeliverable(sql, id, { status, paths = [], error = null }) {
  return sql`
    update deliverables
    set status = ${status}, paths = ${paths}, error = ${error}, finished_at = now()
    where id = ${id}
    returning id
  `;
}

// Links on the lead's open tasks (the Work drawer shows task links only); on the lead itself when it
// has none. Skips a url the target already has. One call per run: urls[i] is labelled labels[i].
export function linkDeliverableFiles(sql, slug, urls, labels) {
  return sql`
    with b as (select id from businesses where os_slug = ${slug} limit 1),
    open as (select t.id from tasks t join b on t.business_id = b.id where t.status <> 'done'),
    targets as (
      select id as task_id, null::uuid as business_id from open
      union all
      select null::uuid, id from b where not exists (select 1 from open)
    )
    insert into links (task_id, business_id, url, label, via)
    select t.task_id, t.business_id, f.url, f.label, 'hq-job'
    from targets t cross join unnest(${urls}::text[], ${labels}::text[]) as f(url, label)
    where not exists (
      select 1 from links l
      where l.url = f.url and l.task_id is not distinct from t.task_id and l.business_id is not distinct from t.business_id
    )
    returning id
  `;
}

export function profileHandle(sql, userId) {
  return sql`select handle from profiles where id = ${userId} limit 1`;
}

// What the prompt may know about the lead/client behind a slug. No email column.
export function leadForSlug(sql, slug) {
  return sql`
    select b.name, b.domain, b.phone, b.address, b.town, b.state, b.trade, b.stage, b.research
    from businesses b where b.os_slug = ${slug} limit 1
  `;
}

export function clientForSlug(sql, slug) {
  return sql`select slug, display_name, notes from clients where slug = ${slug} limit 1`;
}
