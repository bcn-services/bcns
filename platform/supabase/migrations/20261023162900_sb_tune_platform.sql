-- SB tuning, platform half (plan item B). Four independent additions, one migration:
--   1. data.jobs.position       Monday board order, for the SB "Daily" panel.
--   2. data.source_commands     a generic write-back queue (member enqueues over an RPC, the worker executes).
--   3. data.clients.home_layout per-client dashboard layout (jsonb, null = default), written by an RPC.
--   4. data.clients.branding    logo/name/accent, plus the public `branding` storage bucket.
-- Existing api views are replaced with `create or replace`, appending columns only, so the grants
-- from 20260912000400 stay and every existing column keeps its position and type.

-- ---------------------------------------------------------------- 1. jobs.position
-- 0-based index in items_page order across one whole board pull (Monday); null for other sources.
alter table data.jobs add column position int;

create or replace view api.jobs_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, title, status, is_done, priority, group_name, owner, due_on, url,
         deleted_at, source_updated_at, updated_at, position
  from data.jobs;

-- ---------------------------------------------------------------- 2. source_commands
-- Nothing source-specific in the table: `kind` and `payload` are interpreted by the worker's
-- executor for `source`. status: queued -> done | failed (the worker is the only writer).
create table data.source_commands (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references data.clients(id) on delete cascade,
  source     data.source not null,
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  result     jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index source_commands_queued on data.source_commands (created_at) where status = 'queued';
create index source_commands_client on data.source_commands (client_id, created_at desc);

alter table data.source_commands enable row level security;
alter table data.source_commands force row level security;
create policy tenant on data.source_commands for select to authenticated
  using (client_id = (select data.active_client_id()));
-- Select only: no insert/update/delete grant, so the RPC below is the only way in.
grant select on data.source_commands to authenticated;

-- updated_at is appended because every api view must expose client_id, source, updated_at
-- (catalog.test.ts api_views_common_columns); it is the last time the row changed.
create view api.source_commands_v1 with (security_invoker = true) as
  select id, client_id, source, kind, payload, status, result, created_at, done_at,
         coalesce(done_at, created_at) as updated_at
  from data.source_commands;
grant select on api.source_commands_v1 to authenticated;

-- Member or owner. client_id comes from the caller's membership, never a parameter. The source must be
-- one of the client's enabled connectors; `kind` is only shape-checked here, an unknown kind is
-- marked failed by the worker with a reason. At most 50 queued per client.
create function api.enqueue_source_command(p_source data.source, p_kind text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  tenant uuid := data.tenant_or_raise();
  v_id uuid;
begin
  perform data.require_w();
  if p_kind is null or p_kind !~ '^[a-z_]{1,64}$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'kind';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 4096 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'payload';
  end if;
  if p_source is null or not exists (
    select 1 from data.connector_schedule s where s.client_id = tenant and s.source = p_source and s.enabled
  ) then
    raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'source';
  end if;
  if (select count(*) from data.source_commands c where c.client_id = tenant and c.status = 'queued') >= 50 then
    raise exception using errcode = 'BCNS9', message = 'rate_limited';
  end if;
  insert into data.source_commands (client_id, source, kind, payload, created_by)
  values (tenant, p_source, p_kind, p_payload, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function api.enqueue_source_command(data.source, text, jsonb) from public, anon, service_role;
grant execute on function api.enqueue_source_command(data.source, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- 3. home_layout + 4. branding
alter table data.clients add column home_layout jsonb;
-- {logo_path?, name?, accent?}; written by platform/scripts/set-branding.ts only.
alter table data.clients add column branding jsonb;

create or replace view api.client_v1 with (security_invoker = true) as
  select id as client_id, 'platform'::data.source as source, name, slug, timezone, status,
         egress_quota_bytes, updated_at, app_url, home_layout, branding
  from data.clients;

-- Shape (checked by the app, not here): {"v":1,"items":[{"i":"<panel id>","x":0,"y":0,"w":4,"h":3}]}.
-- null (or JSON null) resets to the default layout; anything but an object is refused; > 16 KB is refused.
create function api.set_home_layout(p_layout jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  perform data.require_w();
  if p_layout is not null and jsonb_typeof(p_layout) = 'null' then p_layout := null; end if;
  if p_layout is not null then
    if jsonb_typeof(p_layout) <> 'object' then
      raise exception using errcode = 'BCNS3', message = 'validation', detail = 'layout';
    end if;
    if length(p_layout::text) > 16384 then
      raise exception using errcode = 'BCNS5', message = 'too_large', detail = 'layout';
    end if;
  end if;
  update data.clients set home_layout = p_layout where id = tenant;
end $$;

revoke all on function api.set_home_layout(jsonb) from public, anon, service_role;
grant execute on function api.set_home_layout(jsonb) to authenticated;

-- Public bucket: the logo is shown on a signed-out page too. Objects are <client_id>/logo.png and
-- <client_id>/favicon.png. No storage.objects policy for authenticated: only the service role
-- (set-branding.ts) writes, and a public bucket is readable without one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png'];
