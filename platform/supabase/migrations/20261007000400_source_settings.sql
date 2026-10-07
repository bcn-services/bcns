-- Hub per-source settings page (apps/connect/app/sources/[source]): an owner re-syncs a
-- source or repoints a meet/drive folder without bcns typing SQL; a member reads.
--
-- Reads are security-definer api functions, not api views: data.connector_schedule and
-- data.connector_runs are internal (catalog.test.ts internal_tables_unreachable — no grant
-- to authenticated), and every api view must be security_invoker, so a view over them
-- would need a table grant that exposes `config` and the lease columns. Same shape as
-- api.ai_last_used_at (20261007000300): tenant from data.tenant_or_raise(), never an argument.
--
-- `config` reaches the hub only through TARGET_KEYS below, one jsonb_build_object over
-- named keys. Never `config` itself and never a deny-list: config holds oauth_client_id
-- today and may hold anything tomorrow. Nothing here reads data.source_tokens.
--
-- Errors (PostgREST error.code / error.message):
--   BCNS0 no_tenant · BCNS2 forbidden_role (needs owner) · BCNS3 validation (detail names
--   the field) · BCNS4 not_found detail 'source' (no enabled schedule for that source) ·
--   BCNS9 rate_limited (detail = next allowed time, ISO UTC) or sync_running (a worker holds the lease).

-- updated_at is bumped by the touch trigger on every worker cursor write, so the rate limit
-- needs its own column. A column, not a config key: data.attach_source rewrites config on
-- every reconnect (config = excluded.config).
alter table data.connector_schedule add column last_reset_at timestamptz;
-- Set only by api.set_source_folder: the hub compares runs started after it to warn when the
-- new folder came back empty.
alter table data.connector_schedule add column folder_changed_at timestamptz;

-- One row per source of the caller's client. target = TARGET_KEYS only, nulls stripped.
create function api.source_settings_v1()
returns table (
  source                data.source,
  enabled               boolean,
  sync_interval         interval,
  last_run_at           timestamptz,
  last_success_at       timestamptz,
  next_run_at           timestamptz,
  last_reset_at         timestamptz,
  next_reset_allowed_at timestamptz,
  folder_changed_at     timestamptz,
  sync_running          boolean,
  target                jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  return query
    select s.source, s.enabled, s.interval, s.last_run_at, s.last_success_at, s.next_run_at,
           s.last_reset_at, s.last_reset_at + interval '1 hour', s.folder_changed_at,
           coalesce(s.lease_until > now(), false),
           -- TARGET_KEYS
           jsonb_strip_nulls(jsonb_build_object(
             'folder_id', s.config->'folder_id',
             'notes_url', s.config->'notes_url',
             'board_url', s.config->'board_url',
             'board_id',  s.config->'board_id',
             'admin_url', s.config->'admin_url',
             'shop',      s.config->'shop',
             'realm_id',  s.config->'realm_id'))
    from data.connector_schedule s
    where s.client_id = tenant
    order by s.source;
end $$;

revoke all on function api.source_settings_v1() from public, anon, service_role;
grant execute on function api.source_settings_v1() to authenticated;

-- The last 20 runs of one source of the caller's client, newest first. No lease_owner,
-- no entity_rows: the page shows mode, times, status, rows and the (worker-redacted) error.
create function api.connector_runs_v1(p_source data.source)
returns table (
  source        data.source,
  mode          data.run_mode,
  status        data.run_status,
  started_at    timestamptz,
  finished_at   timestamptz,
  rows_fetched  int,
  rows_upserted int,
  error         text
)
language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  return query
    select r.source, r.mode, r.status, r.started_at, r.finished_at, r.rows_fetched, r.rows_upserted, r.error
    from data.connector_runs r
    where r.client_id = tenant and r.source = p_source
    order by r.started_at desc
    limit 20;
end $$;

revoke all on function api.connector_runs_v1(data.source) from public, anon, service_role;
grant execute on function api.connector_runs_v1(data.source) to authenticated;

-- Why a reset or folder change did not happen. Called only after the guarded update matched
-- no row; raises, never returns normally. rate_limited only for the hourly-limited reset
-- (p_hourly) and only while the last reset really is under an hour old; anything else that
-- blocked the update was a sync holding the lease (it may have just released it).
create function data.source_reset_refused(p_client_id uuid, p_source data.source, p_hourly boolean)
returns void language plpgsql set search_path = '' as $$
declare s record;
begin
  select sc.enabled, sc.lease_until, sc.last_reset_at into s
  from data.connector_schedule sc where sc.client_id = p_client_id and sc.source = p_source;
  if not found or not s.enabled then
    raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'source';
  end if;
  if s.lease_until > now() then
    raise exception using errcode = 'BCNS9', message = 'sync_running';
  end if;
  if p_hourly and s.last_reset_at > now() - interval '1 hour' then
    raise exception using errcode = 'BCNS9', message = 'rate_limited',
      detail = to_char((s.last_reset_at + interval '1 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  raise exception using errcode = 'BCNS9', message = 'sync_running';
end $$;

revoke all on function data.source_reset_refused(uuid, data.source, boolean) from public, anon, authenticated, service_role;

-- Re-sync: exactly what `add-source --reset-cursors` runs (backfill_cursor = '{}' puts the
-- worker in backfill mode from backfill_from), owner only, one per source per hour.
-- One guarded UPDATE, so two clicks cannot both pass the limit. Refused while a worker holds
-- the lease: its next page commit (run.ts, guarded by lease_owner only) would overwrite the
-- reset cursor. Shopify is not offered (its own install flow owns that source).
create function api.reset_source_cursors(p_source data.source)
returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_source = 'shopify' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;
  update data.connector_schedule s
  set backfill_cursor = '{}', incremental_cursor = '{}', next_run_at = now(), last_reset_at = now()
  where s.client_id = tenant and s.source = p_source and s.enabled
    and (s.last_reset_at is null or s.last_reset_at <= now() - interval '1 hour')
    and (s.lease_until is null or s.lease_until <= now());
  if not found then
    perform data.source_reset_refused(tenant, p_source, true);
  end if;
end $$;

revoke all on function api.reset_source_cursors(data.source) from public, anon, service_role;
grant execute on function api.reset_source_cursors(data.source) to authenticated;

-- Change folder (meet/drive): store the id and its link, and reset the cursors in the same
-- statement — the saved cursors belong to the old folder. The worker's next run is the
-- validation (the hub has no Drive credentials). NOT held to the 1-hour re-sync limit on
-- purpose: an owner who pasted the wrong link must be able to fix it at once. Still refused
-- while a sync holds the lease, for the same reason as the reset.
-- The id lands in the worker's Drive query ('<id>' in parents), so it is checked here, not
-- only in the hub: Drive ids are [A-Za-z0-9_-].
create function api.set_source_folder(p_source data.source, p_folder_id text, p_folder_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  tenant uuid := data.tenant_or_raise();
  url text;
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_source is null or p_source not in ('meet', 'drive') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;
  if p_folder_id is null or p_folder_id !~ '^[A-Za-z0-9_-]{10,128}$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'folder_id';
  end if;
  url := coalesce(p_folder_url, 'https://drive.google.com/drive/folders/' || p_folder_id);
  if url !~ '^https://drive\.google\.com/[^\s"<>]*$' or length(url) > 500 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'folder_url';
  end if;
  update data.connector_schedule s
  set config = s.config || jsonb_build_object('folder_id', p_folder_id, 'notes_url', url),
      backfill_cursor = '{}', incremental_cursor = '{}', next_run_at = now(),
      last_reset_at = now(), folder_changed_at = now()
  where s.client_id = tenant and s.source = p_source and s.enabled
    and (s.lease_until is null or s.lease_until <= now());
  if not found then
    perform data.source_reset_refused(tenant, p_source, false);
  end if;
end $$;

revoke all on function api.set_source_folder(data.source, text, text) from public, anon, service_role;
grant execute on function api.set_source_folder(data.source, text, text) to authenticated;
