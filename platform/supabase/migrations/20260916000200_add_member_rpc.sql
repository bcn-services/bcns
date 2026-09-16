-- api.add_member — the write half of api.remove_member, and the only way a
-- membership row is created from outside the operator CLI.
--
-- WHY THIS EXISTS: the `invite-member` Edge Function (chunk 4) needs the
-- service role to create the auth user, but service_role has NO usage on the
-- `api` or `data` schemas and PostgREST only exposes `api`, so it cannot write
-- data.memberships at all. Rather than widen what the service role can reach,
-- the function creates the user with the Auth admin API and then calls this RPC
-- with the CALLER'S OWN token: the tenant comes from the caller's JWT and the
-- owner check happens in the database, exactly like remove_member.
--
-- `member_role` is text, not data.member_role, so calling it needs no USAGE on
-- the `data` schema; the values are checked here and cast inside.
create function api.add_member(target_user_id uuid, member_role text default 'member')
returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if member_role is null or member_role not in ('member', 'owner') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'role';
  end if;
  -- memberships.user_id is the primary key: one user belongs to one client.
  -- Without this an owner could re-point another client's user at their own.
  if exists (select 1 from data.memberships m where m.user_id = target_user_id and m.client_id <> tenant) then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'other_client';
  end if;
  insert into data.memberships (user_id, client_id, role)
  values (target_user_id, tenant, member_role::data.member_role)
  -- Re-inviting an existing member is idempotent. is_smoke is never touched:
  -- only the operator CLI mints a smoke user, and remove_member refuses to drop one.
  on conflict (user_id) do update set role = excluded.role;
end $$;

-- Default EXECUTE goes to PUBLIC on a new function; strip it, then allow-list,
-- mirroring 20260912000500_api_rpcs.sql.
revoke all on function api.add_member(uuid, text) from public, anon, service_role;
grant execute on function api.add_member(uuid, text) to authenticated;
