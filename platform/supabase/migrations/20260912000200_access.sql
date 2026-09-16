-- bcns-data: auth hook, helpers, grants, RLS (DESIGN.md §2)

-- ---------------------------------------------------------------- 2.1 auth hook
create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rec record; claims jsonb := event->'claims';
begin
  select mem.client_id, mem.role, c.status into rec
  from data.memberships mem join data.clients c on c.id = mem.client_id
  where mem.user_id = (event->>'user_id')::uuid;
  if rec is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'no membership'));
  end if;
  if rec.status <> 'active' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'client ' || rec.status));
  end if;
  claims := coalesce(claims, '{}'::jsonb) || jsonb_build_object('client_id', rec.client_id, 'client_role', rec.role);
  return jsonb_set(event, '{claims}', claims);
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public, data to supabase_auth_admin;
grant select on data.memberships, data.clients to supabase_auth_admin;

-- ---------------------------------------------------------------- 2.2 helpers
create function data.jwt_client_id() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'client_id', '')::uuid $$;
create function data.jwt_client_role() returns data.member_role language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'client_role', '')::data.member_role $$;

-- Live re-check every request (D6): membership row must still exist, client must be active.
create function data.active_client_id() returns uuid language sql stable security definer set search_path = '' as $$
  select m.client_id
    from data.memberships m join data.clients c on c.id = m.client_id
   where m.user_id = auth.uid() and m.client_id = data.jwt_client_id() and c.status = 'active' $$;
create function data.active_client_role() returns data.member_role language sql stable security definer set search_path = '' as $$
  select m.role
    from data.memberships m join data.clients c on c.id = m.client_id
   where m.user_id = auth.uid() and m.client_id = data.jwt_client_id() and c.status = 'active' $$;

create function data.egress_exceeded() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(e.bytes, 0) >= c.egress_quota_bytes
  from data.clients c
  left join data.egress_ledger e
    on e.client_id = c.id and e.month = date_trunc('month', now() at time zone c.timezone)::date
  where c.id = data.active_client_id() $$;

create function data.has_download_ticket(object_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from data.download_tickets t
                  where t.client_id = data.active_client_id() and t.storage_path = object_name and t.expires_at > now()) $$;

-- ---------------------------------------------------------------- 2.3 grants
-- Supabase's global default privileges hand every new table/function in any schema to
-- anon/authenticated/service_role; strip them and re-grant the allow-list only.
revoke all on schema data from public, anon, authenticated;
revoke all on schema public from anon, authenticated;
revoke all on all tables in schema data from public, anon, authenticated, service_role;
revoke all on all sequences in schema data from public, anon, authenticated, service_role;
revoke all on all functions in schema data from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema data revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema data revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema data revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema api revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema api revoke all on functions from anon, authenticated, service_role;

grant usage on schema api to anon, authenticated;
grant usage on schema data to authenticated;   -- needed to execute the four helpers below (no table grants)
grant execute on function data.active_client_id(), data.active_client_role(), data.egress_exceeded(),
  data.has_download_ticket(text) to authenticated;
grant select on data.clients, data.memberships, data.dashboard_versions, data.connector_health, data.egress_ledger,
  data.customers, data.jobs, data.messages, data.money, data.media, data.media_sets, data.media_set_items,
  data.products, data.daily_metrics, data.records to authenticated;

-- ---------------------------------------------------------------- 2.4 RLS
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'data' loop
    execute format('alter table data.%I enable row level security', t);
    execute format('alter table data.%I force row level security', t);
  end loop;
end $$;

create policy tenant on data.clients            for select to authenticated using (id = (select data.active_client_id()));
create policy tenant on data.memberships        for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.dashboard_versions for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.connector_health   for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.egress_ledger      for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.customers          for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.jobs               for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.messages           for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.money              for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.media              for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.media_sets         for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.media_set_items    for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.products           for select to authenticated using (client_id = (select data.active_client_id()));
create policy tenant on data.daily_metrics      for select to authenticated using (client_id = (select data.active_client_id()));
create policy auth_admin_read on data.clients     for select to supabase_auth_admin using (true);
create policy auth_admin_read on data.memberships for select to supabase_auth_admin using (true);
create policy tenant on data.records            for select to authenticated using (client_id = (select data.active_client_id()) and deleted_at is null);
