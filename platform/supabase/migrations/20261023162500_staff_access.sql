-- Staff access: one operator account can sign in to any client's workspace.
--
-- memberships.user_id is the primary key (one user = one client), so a staff user cannot hold a
-- membership per client. Instead data.staff names the ONE workspace the user is currently in
-- (staff.client_id). The auth hook puts that client in the token as an owner; data.active_client_id()
-- / active_client_role() -- the choke point every RLS policy, api view, RPC and storage policy
-- already goes through -- accept a staff row exactly like a membership row. Nothing else changes.
--
-- Switching workspace is a Nate-run `update data.staff set client_id = ...` followed by a fresh
-- sign-in (or token refresh). The helpers bind to staff.client_id, so a token minted for the old
-- workspace stops reading the moment the row moves, and deleting the row revokes on the next
-- request (same live re-check as memberships, D6).
--
-- No grants to authenticated/anon/service_role and no policy for them: staff rows are written only
-- from the SQL editor / postgres. A target client that is not active falls back to the user's own
-- membership path, so a stale staff row can never lock the account out.

create table data.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  client_id  uuid not null references data.clients(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table data.staff enable row level security;
alter table data.staff force row level security;
grant select on data.staff to supabase_auth_admin;
create policy auth_admin_read on data.staff for select to supabase_auth_admin using (true);

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rec record; claims jsonb := event->'claims';
begin
  select s.client_id, 'owner'::data.member_role as role into rec
  from data.staff s join data.clients c on c.id = s.client_id
  where s.user_id = (event->>'user_id')::uuid and c.status = 'active';
  if found then
    claims := coalesce(claims, '{}'::jsonb) || jsonb_build_object('client_id', rec.client_id, 'client_role', rec.role);
    return jsonb_set(event, '{claims}', claims);
  end if;

  select mem.client_id, mem.role, c.status into rec
  from data.memberships mem join data.clients c on c.id = mem.client_id
  where mem.user_id = (event->>'user_id')::uuid;
  if rec is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'no membership'));
  end if;
  if rec.status in ('pending', 'paused') then
    -- Signed in, tenant-less: strip any tenant claim and add only the marker.
    claims := (coalesce(claims, '{}'::jsonb) - 'client_id' - 'client_role') || jsonb_build_object('client_status', rec.status);
    return jsonb_set(event, '{claims}', claims);
  end if;
  if rec.status <> 'active' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'client ' || rec.status));
  end if;
  claims := coalesce(claims, '{}'::jsonb) || jsonb_build_object('client_id', rec.client_id, 'client_role', rec.role);
  return jsonb_set(event, '{claims}', claims);
end $$;
-- CREATE OR REPLACE keeps the existing grants (20260912000200); nothing to re-grant.

create or replace function data.active_client_id() returns uuid language sql stable security definer set search_path = '' as $$
  select c.id
    from data.clients c
   where c.id = data.jwt_client_id() and c.status = 'active'
     and (exists (select 1 from data.memberships m where m.user_id = auth.uid() and m.client_id = c.id)
          or exists (select 1 from data.staff s where s.user_id = auth.uid() and s.client_id = c.id)) $$;

create or replace function data.active_client_role() returns data.member_role language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'owner'::data.member_role from data.staff s
       where s.user_id = auth.uid() and s.client_id = data.active_client_id()),
    (select m.role from data.memberships m
       where m.user_id = auth.uid() and m.client_id = data.active_client_id())) $$;
