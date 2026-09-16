-- bcns-data: api RPCs (DESIGN.md §3.3). All security definer, search_path '', every statement client_id = tenant.

create function data.tenant_or_raise() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare t uuid := data.active_client_id();
begin
  if t is null then raise exception using errcode = 'BCNS0', message = 'no_tenant'; end if;
  return t;
end $$;

create function data.require_w() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if data.active_client_role() is null then raise exception using errcode = 'BCNS2', message = 'forbidden_role'; end if;
end $$;

create function data.clean_tags(tags text[]) returns text[] language plpgsql immutable as $$
declare out text[]; t text;
begin
  if tags is null then return null; end if;
  if array_length(tags, 1) > 50 then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'tags'; end if;
  foreach t in array tags loop
    t := lower(trim(t));
    if t !~ '^[a-z0-9 _-]{1,40}$' then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'tags'; end if;
    if not (t = any(coalesce(out, '{}'))) then out := array_append(out, t); end if;
  end loop;
  return coalesce(out, '{}');
end $$;

-- shared by api.register_upload (authenticated) and scripts/import-media (service role)
create function data.register_media(client uuid, path text, title text, tags text[], uploader uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o record; v_bytes bigint; v_mime text; v_id uuid;
begin
  if path !~ ('^' || client || E'/orig/[0-9a-f-]{36}\\.[a-z0-9]{1,8}$') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'path';
  end if;
  select metadata into o from storage.objects where bucket_id = 'media' and name = path;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'path'; end if;
  v_bytes := (o.metadata->>'size')::bigint; v_mime := o.metadata->>'mimetype';
  if v_bytes > 104857600 then raise exception using errcode = 'BCNS5', message = 'too_large', detail = 'bytes'; end if;
  insert into data.media (client_id, source, external_id, storage_path, kind, filename, mime, bytes, title, tags, uploaded_by)
  values (client, 'upload', path, path,
          case when v_mime like 'image/%' then 'image' when v_mime like 'video/%' then 'video' else 'file' end,
          coalesce(title, regexp_replace(path, '^.*/', '')), v_mime, v_bytes, title, data.clean_tags(coalesce(tags, '{}')), uploader)
  on conflict (client_id, source, external_id) do update
    set title = excluded.title, tags = excluded.tags, bytes = excluded.bytes, mime = excluded.mime, deleted_at = null, purge_after = null
  returning id into v_id;
  return v_id;
end $$;

create function api.save_record(kind text, attributes jsonb, external_id text default null, title text default null,
                                body text default null, occurred_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); v_id uuid;
begin
  if kind is null or kind !~ '^[a-z_]{1,64}$' or kind in ('campaign','ad') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'kind';
  end if;
  if pg_column_size(coalesce(attributes, '{}'::jsonb)) > 262144 then
    raise exception using errcode = 'BCNS5', message = 'too_large', detail = 'attributes';
  end if;
  insert into data.records (client_id, source, external_id, kind, attributes, title, body, occurred_at)
  values (tenant, 'dashboard', coalesce(external_id, gen_random_uuid()::text), kind, coalesce(attributes, '{}'::jsonb),
          title, body, coalesce(occurred_at, now()))
  on conflict on constraint records_client_id_source_external_id_key do update
    set attributes = excluded.attributes, title = excluded.title, body = excluded.body,
        occurred_at = excluded.occurred_at, deleted_at = null
  where data.records.client_id = tenant
  returning id into v_id;
  return v_id;
end $$;

create function api.delete_record(record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  update data.records set deleted_at = now()
   where id = record_id and client_id = tenant and source = 'dashboard' and deleted_at is null;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'record_id'; end if;
end $$;

create function api.register_upload(path text, title text default null, tags text[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  perform data.require_w();
  return data.register_media(tenant, path, title, tags, auth.uid());
end $$;

create function api.update_media(media_id uuid, title text default null, tags text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); v_tags text[] := data.clean_tags(tags);
begin
  perform data.require_w();
  update data.media m set title = coalesce(update_media.title, m.title), tags = coalesce(v_tags, m.tags)
   where m.id = media_id and m.client_id = tenant;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'media_id'; end if;
end $$;

create function api.bulk_tag(media_ids uuid[], add text[] default '{}', remove text[] default '{}') returns int
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); n int;
        v_add text[] := data.clean_tags(coalesce(add, '{}')); v_rm text[] := data.clean_tags(coalesce(remove, '{}'));
begin
  perform data.require_w();
  if array_length(media_ids, 1) > 500 then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'media_ids'; end if;
  update data.media m
     set tags = (select coalesce(array_agg(distinct t order by t), '{}') from unnest(m.tags || v_add) t where t <> all(v_rm))
   where m.id = any(media_ids) and m.client_id = tenant;
  get diagnostics n = row_count;
  return n;
end $$;

create function api.delete_media(media_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); n int;
begin
  perform data.require_w();
  if array_length(media_ids, 1) > 500 then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'media_ids'; end if;
  update data.media set deleted_at = now(), purge_after = now() + interval '30 days'
   where id = any(media_ids) and client_id = tenant and source = 'upload' and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function api.restore_media(media_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); n int;
begin
  perform data.require_w();
  if array_length(media_ids, 1) > 500 then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'media_ids'; end if;
  update data.media set deleted_at = null, purge_after = null
   where id = any(media_ids) and client_id = tenant and deleted_at is not null and purge_after > now();
  get diagnostics n = row_count;
  return n;
end $$;

create function api.create_media_set(name text, description text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); v_id uuid;
begin
  perform data.require_w();
  if name is null or length(trim(name)) not between 1 and 80 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'name';
  end if;
  if exists (select 1 from data.media_sets where client_id = tenant and media_sets.name = trim(create_media_set.name)) then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'name_taken';
  end if;
  insert into data.media_sets (client_id, name, description, created_by) values (tenant, trim(name), description, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function api.update_media_set(set_id uuid, name text default null, description text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  perform data.require_w();
  if name is not null and length(trim(name)) not between 1 and 80 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'name';
  end if;
  if name is not null and exists (select 1 from data.media_sets s where s.client_id = tenant and s.name = trim(update_media_set.name) and s.id <> set_id) then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'name_taken';
  end if;
  update data.media_sets s set name = coalesce(trim(update_media_set.name), s.name),
                              description = coalesce(update_media_set.description, s.description)
   where s.id = set_id and s.client_id = tenant;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'set_id'; end if;
end $$;

create function api.delete_media_set(set_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  perform data.require_w();
  delete from data.media_sets where id = set_id and client_id = tenant;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'set_id'; end if;
end $$;

create function api.set_media_set_items(set_id uuid, media_ids uuid[], action text) returns int
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); n int;
begin
  perform data.require_w();
  if action not in ('add','remove') then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'action'; end if;
  if array_length(media_ids, 1) > 500 then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'media_ids'; end if;
  if not exists (select 1 from data.media_sets where id = set_id and client_id = tenant) then
    raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'set_id';
  end if;
  if action = 'add' then
    insert into data.media_set_items (client_id, set_id, media_id)
    select tenant, set_id, m.id from data.media m where m.id = any(media_ids) and m.client_id = tenant
    on conflict do nothing;
  else
    delete from data.media_set_items i
     using data.media m
     where i.set_id = set_media_set_items.set_id and i.client_id = tenant and i.media_id = m.id
       and m.id = any(media_ids) and m.client_id = tenant;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create function api.download_url(media_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise(); m record; v_month date; used bigint; quota bigint;
begin
  select id, storage_path, bytes into m from data.media
   where id = media_id and client_id = tenant and deleted_at is null and storage_path is not null;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'media_id'; end if;
  select date_trunc('month', now() at time zone c.timezone)::date, c.egress_quota_bytes into v_month, quota
    from data.clients c where c.id = tenant;
  insert into data.egress_ledger (client_id, month, bytes) values (tenant, v_month, 0)
  on conflict (client_id, month) do update set bytes = data.egress_ledger.bytes
  returning bytes into used;
  if used >= quota then
    raise exception using errcode = 'BCNS1', message = 'budget_reached',
      detail = jsonb_build_object('used', used, 'quota', quota)::text;
  end if;
  update data.egress_ledger set bytes = bytes + coalesce(m.bytes, 0), updated_at = now()
   where client_id = tenant and month = v_month returning bytes into used;
  insert into data.download_tickets (client_id, storage_path, expires_at) values (tenant, m.storage_path, now() + interval '5 minutes')
  on conflict (client_id, storage_path) do update set expires_at = excluded.expires_at;
  return jsonb_build_object('path', m.storage_path, 'bytes', m.bytes, 'expires_in', 300,
                            'egress', jsonb_build_object('used', used, 'quota', quota));
end $$;

create function api.report_dashboard_version(app_version text, api_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  insert into data.dashboard_versions (client_id, app_version, api_version) values (tenant, app_version, api_version)
  on conflict (client_id) do update set app_version = excluded.app_version, api_version = excluded.api_version, reported_at = now()
  where data.dashboard_versions.client_id = tenant;
end $$;

create function api.remove_member(target_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if target_user_id = auth.uid() then raise exception using errcode = 'BCNS3', message = 'validation', detail = 'self'; end if;
  if exists (select 1 from data.memberships where user_id = target_user_id and client_id = tenant and is_smoke) then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'smoke';
  end if;
  delete from data.memberships where user_id = target_user_id and client_id = tenant;
  if not found then raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'target_user_id'; end if;
end $$;

-- privileges: strip defaults, then the explicit allow-list
revoke all on all functions in schema data from public, anon, authenticated, service_role;
revoke all on all functions in schema api from public, anon, authenticated, service_role;
grant execute on function data.active_client_id(), data.active_client_role(), data.egress_exceeded(),
  data.has_download_ticket(text) to authenticated;
grant execute on all functions in schema api to authenticated;
grant execute on all functions in schema api to service_role;
grant execute on function data.register_media(uuid, text, text, text[], uuid), data.ensure_raw_partitions(),
  data.local_day(timestamptz, uuid) to service_role;
