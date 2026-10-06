-- Database half of chunk 6c PR C (docs/architecture/chunk6c-mcp-launch.md section 3 and 3b):
-- an audit row per MCP tool call, and the owner switch "let AI see customer contact info".
--
-- data.mcp_tool_calls: apps/mcp calls api.log_mcp_call with the caller's own token after each
-- tools/call. Nobody holds an insert grant; the security-definer RPC is the only writer, and it
-- stamps client_id and user_id from the session, so a tenant can only write rows for itself.
-- Tenants may read their own rows (policy `tenant`); bcns reads across tenants with a plain SELECT.
-- No retention at launch (rows are tiny).
--
-- data.ai_settings: one row per client, absent row = switch off. Read through api.get_ai_settings
-- (any member), written through api.set_ai_settings (owner only). Enforced in apps/mcp: the
-- database cannot tell an MCP token from a hub token.
--
-- Deviation from the spec: the read is an RPC, not an api.ai_settings_v1 view. A new api view
-- must be listed in packages/data-client VIEW_DESCRIPTIONS (exhaustive Record<ViewName, string>),
-- and this PR does not touch packages/**.

create table data.mcp_tool_calls (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references data.clients(id) on delete cascade,
  user_id    uuid not null,
  tool       text not null,
  view       text,
  row_count  int,
  ok         boolean not null,
  error_code text,
  at         timestamptz not null default now()
);
create index mcp_tool_calls_client_at on data.mcp_tool_calls (client_id, at desc);

create table data.ai_settings (
  client_id              uuid primary key references data.clients(id) on delete cascade,
  share_customer_contact boolean not null default false,
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);

-- New tables get no grants (default privileges revoke), and the RLS loop in 20260912000200 only
-- covered tables that existed then: enable and force here.
alter table data.mcp_tool_calls enable row level security;
alter table data.mcp_tool_calls force row level security;
alter table data.ai_settings enable row level security;
alter table data.ai_settings force row level security;

create policy tenant on data.mcp_tool_calls for select to authenticated
  using (client_id = (select data.active_client_id()));
create policy tenant on data.ai_settings for select to authenticated
  using (client_id = (select data.active_client_id()));

grant select on data.mcp_tool_calls, data.ai_settings to authenticated;

-- Tenant and user from the session, never arguments. Text args are cut to 64 chars rather than
-- rejected: a logging call must not fail a tool call over a long error string.
create function api.log_mcp_call(p_tool text, p_view text, p_row_count int, p_ok boolean, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if p_tool is null or p_tool = '' or p_ok is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'tool';
  end if;
  insert into data.mcp_tool_calls (client_id, user_id, tool, view, row_count, ok, error_code)
  values (tenant, auth.uid(), left(p_tool, 64), left(p_view, 64), p_row_count, p_ok, left(p_error_code, 64));
end $$;

revoke all on function api.log_mcp_call(text, text, int, boolean, text) from public, anon, service_role;
grant execute on function api.log_mcp_call(text, text, int, boolean, text) to authenticated;

-- Any member of the caller's tenant may read. Missing row = off.
create function api.get_ai_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  return jsonb_build_object('share_customer_contact', coalesce(
    (select s.share_customer_contact from data.ai_settings s where s.client_id = tenant), false));
end $$;

revoke all on function api.get_ai_settings() from public, anon, service_role;
grant execute on function api.get_ai_settings() to authenticated;

-- Owner only, like api.disconnect_source (require_w lets any member through).
create function api.set_ai_settings(p_share_customer_contact boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_share_customer_contact is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'share_customer_contact';
  end if;
  insert into data.ai_settings (client_id, share_customer_contact, updated_at, updated_by)
  values (tenant, p_share_customer_contact, now(), auth.uid())
  on conflict (client_id) do update
    set share_customer_contact = excluded.share_customer_contact, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end $$;

revoke all on function api.set_ai_settings(boolean) from public, anon, service_role;
grant execute on function api.set_ai_settings(boolean) to authenticated;
