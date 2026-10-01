-- P1 owner self-service sign-up (pending account). Two pieces:
--
-- 1. custom_access_token_hook learns one new case. A user whose client is `pending` may sign in, but
--    the token carries NO client_id / client_role — only `client_status: 'pending'`, a non-tenant
--    marker the hub uses to show /pending instead of "no membership". data.jwt_client_id() is null
--    for that token and data.active_client_id() (unchanged) still requires status = 'active', so
--    every api view stays empty and every RPC raises BCNS0. paused, churned and no-membership keep
--    today's 403 byte-for-byte.
--
-- 2. api.signup_create_client: the ONE write the public `signup` Edge Function makes after it has
--    created the auth user. Creates the pending client and the owner membership in one transaction
--    (either both rows exist or neither). service_role only, like api.record_shop_redact
--    (20260924000300): the function has no caller JWT, and service_role still holds no privilege on
--    any data.* table — this SECURITY DEFINER body is the whole surface.
--
-- Abuse bound: at most 10 pending clients created per rolling hour, across all callers,
-- serialized by an advisory lock so concurrent calls cannot both squeeze under the cap. The Edge
-- Function only sends a confirmation email after this succeeds, so the same cap bounds mail.
-- ponytail: one global hourly cap, no per-IP budget — add one if real sign-ups ever hit the cap.

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rec record; claims jsonb := event->'claims';
begin
  select mem.client_id, mem.role, c.status into rec
  from data.memberships mem join data.clients c on c.id = mem.client_id
  where mem.user_id = (event->>'user_id')::uuid;
  if rec is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'no membership'));
  end if;
  if rec.status = 'pending' then
    -- Signed in, tenant-less: strip any tenant claim and add only the marker.
    claims := (coalesce(claims, '{}'::jsonb) - 'client_id' - 'client_role') || jsonb_build_object('client_status', 'pending');
    return jsonb_set(event, '{claims}', claims);
  end if;
  if rec.status <> 'active' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'client ' || rec.status));
  end if;
  claims := coalesce(claims, '{}'::jsonb) || jsonb_build_object('client_id', rec.client_id, 'client_role', rec.role);
  return jsonb_set(event, '{claims}', claims);
end $$;
-- CREATE OR REPLACE keeps the existing grants (20260912000200_access.sql); nothing to re-grant.

create function api.signup_create_client(p_user_id uuid, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_id uuid;
  n int := 1;
begin
  if p_user_id is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'user';
  end if;
  if length(v_name) not between 1 and 100 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'name';
  end if;

  perform pg_advisory_xact_lock(hashtext('api.signup_create_client'));
  if (select count(*) from data.clients
       where status = 'pending' and created_at > now() - interval '1 hour') >= 10 then
    raise exception using errcode = 'BCNS8', message = 'signup_capped';
  end if;

  -- Slug from the name, fit to data.clients' ^[a-z0-9-]{2,40}$ check: 32 chars of base leaves room
  -- for a "-<n>" de-duplication suffix.
  v_base := btrim(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), 32), '-');
  if length(v_base) < 2 then v_base := 'client'; end if;
  v_slug := v_base;
  while exists (select 1 from data.clients c where c.slug = v_slug) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;

  insert into data.clients (slug, name, status) values (v_slug, v_name, 'pending') returning id into v_id;
  -- memberships.user_id is the primary key: a user who already belongs to a client makes this raise
  -- 23505 and the client insert above rolls back with it.
  insert into data.memberships (user_id, client_id, role) values (p_user_id, v_id, 'owner');
  return v_slug;
end $$;

-- Same allow-list shape as 20260924000300: strip the PUBLIC default, then grant service_role only.
revoke all on function api.signup_create_client(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.signup_create_client(uuid, text) to service_role;
