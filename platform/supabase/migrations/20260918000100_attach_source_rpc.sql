-- data.attach_source + api.connect_source — the one place a source's token and
-- schedule rows are written, and the way a self-serve OAuth flow writes them.
--
-- WHY THIS EXISTS: chunk 5 moves connecting a source from the operator CLI to a
-- browser handshake that finishes inside apps/connect. The hub holds the anon
-- key and nothing else — data.source_tokens has no api view on purpose, and
-- 20260912000200_access.sql revokes every privilege on the `data` schema from
-- anon, authenticated AND service_role, so neither the hub nor an Edge Function
-- can write these rows directly. Same problem api.add_member solved for
-- memberships, same shape of answer: a security definer RPC that takes the
-- tenant from the CALLER'S JWT and checks the role in the database.
--
-- data.attach_source is deliberately split out and called by BOTH this RPC and
-- platform/scripts/onboard.ts (attachSource), exactly as data.register_media is
-- shared by api.register_upload and scripts/import-media. There is one upsert
-- path for these two tables; the OAuth callback and `add-source --source shopify`
-- cannot drift apart, because they run the same statements.

-- The two upserts, lifted verbatim from scripts/onboard.ts attachSource.
-- Not security definer: the callers are api.connect_source (already definer) and
-- the operator scripts (postgres). Nothing else has execute on it.
create function data.attach_source(
  p_client_id      uuid,
  p_source         data.source,
  p_kind           data.token_kind,
  p_secret         text,
  p_refresh_secret text,
  p_expires_at     timestamptz,
  p_attributes     jsonb,
  p_config         jsonb,
  p_interval       interval,
  p_backfill_from  date
) returns void language plpgsql set search_path = '' as $$
begin
  -- Re-running rotates the token and clears a previous failure, so a merchant who
  -- reinstalls a revoked app recovers without an operator touching the row.
  insert into data.source_tokens (client_id, source, kind, secret, refresh_secret, expires_at, attributes)
  values (p_client_id, p_source, p_kind, p_secret, p_refresh_secret, p_expires_at, coalesce(p_attributes, '{}'::jsonb))
  on conflict (client_id, source) do update set
    kind = excluded.kind,
    secret = excluded.secret,
    refresh_secret = excluded.refresh_secret,
    expires_at = excluded.expires_at,
    attributes = excluded.attributes,
    status = 'active',
    status_detail = null;

  -- Only `config` is updated on conflict: backfill_from and the cursors belong to
  -- the run history, and resetting them here would silently re-pull 13 months.
  -- add-source --reset-cursors is still the only way to clear them.
  insert into data.connector_schedule (client_id, source, interval, backfill_from, backfill_cursor, config, next_run_at)
  values (p_client_id, p_source, p_interval, p_backfill_from, '{}'::jsonb, coalesce(p_config, '{}'::jsonb), now())
  on conflict (client_id, source) do update set config = excluded.config;
end $$;

-- The self-serve half. Text parameters rather than the data.* enums: calling
-- this through PostgREST needs no USAGE on the `data` schema, and `authenticated`
-- has none. Values are validated here and cast inside, like api.add_member.
create function api.connect_source(
  p_source         text,
  p_kind           text,
  p_secret         text,
  p_config         jsonb,
  p_interval       text,
  -- A depth ('13 months'), not a date: the subtraction then happens in SQL, the
  -- same expression backfillFrom() builds in scripts/onboard.ts, so the hub and
  -- the CLI cannot disagree about what "13 months ago" means in which timezone.
  p_backfill_depth text
) returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  -- Connecting a source hands bcns a credential for the merchant's store and
  -- changes what the whole client sees. Owner-only, checked in the database:
  -- an authenticated member can call this RPC straight through PostgREST.
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_secret is null or length(p_secret) = 0 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'secret';
  end if;
  -- An unknown source or kind raises 22P02 from the cast; name the field instead.
  if p_source is null or p_kind is null or p_interval is null or p_backfill_depth is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;

  -- `tenant`, never a client id from the request: an owner of A cannot write into B.
  perform data.attach_source(
    tenant, p_source::data.source, p_kind::data.token_kind,
    p_secret, null, null, '{}'::jsonb,
    coalesce(p_config, '{}'::jsonb), p_interval::interval,
    (current_date - p_backfill_depth::interval)::date);
end $$;

-- Default EXECUTE goes to PUBLIC on a new function; strip it, then allow-list,
-- mirroring 20260912000500_api_rpcs.sql and 20260916000200_add_member_rpc.sql.
revoke all on function data.attach_source(uuid, data.source, data.token_kind, text, text, timestamptz, jsonb, jsonb, interval, date)
  from public, anon, authenticated, service_role;
revoke all on function api.connect_source(text, text, text, jsonb, text, text)
  from public, anon, service_role;
grant execute on function api.connect_source(text, text, text, jsonb, text, text) to authenticated;
