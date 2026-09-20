-- api.connect_source gains p_refresh_secret + p_expires_at.
--
-- WHY THIS EXISTS: 20260918000100 wrote `null, null` into data.attach_source's
-- refresh_secret and expires_at positions, because the Shopify token of the day
-- never expired. It does now. The Admin API answered HTTP 403 "[API] Non-expiring
-- access tokens are no longer accepted for the Admin API" on a real install
-- (2026-09-19), so the callback asks for an EXPIRING token — one hour, with a
-- 90-day refresh token beside it. Both of those were parsed and thrown away here.
-- A merchant who connected in the morning was disconnected by the afternoon and
-- nothing in the worker could renew them.
--
-- The table already had the columns (20260912000100_schema.sql:66-78) and
-- data.attach_source already took both (args 5 and 6) — this RPC was the only
-- thing dropping them, so nothing below touches either.
--
-- DROP AND RECREATE, not CREATE OR REPLACE: adding parameters makes a new
-- signature, and leaving the six-argument one in place would make the PostgREST
-- call ambiguous. The consequence is that the grants must be re-applied against
-- the NEW signature — a freshly created function carries EXECUTE for PUBLIC, so
-- skipping the revoke below silently hands anon the ability to write a token row.
-- catalog.test.ts `function_privileges` is what catches that.
--
-- The two new parameters have defaults so every existing six-argument caller
-- (platform/test/helpers.ts, the apps/connect callback before its own change)
-- keeps working untouched.
--
-- Correcting 20260918000100's header while we are here: the RPC and
-- `add-source --source shopify` no longer "run the same statements". They still
-- share data.attach_source, but the CLI now REFUSES shopify outright and prints
-- the hub install link, because an expiring access token and its refresh token
-- only ever come out of an OAuth round-trip — there is no value an operator can
-- paste that survives the hour. The Google CLI path is unchanged.

drop function api.connect_source(text, text, text, jsonb, text, text);

create function api.connect_source(
  p_source         text,
  p_kind           text,
  p_secret         text,
  p_config         jsonb,
  p_interval       text,
  -- A depth ('13 months'), not a date: the subtraction then happens in SQL, the
  -- same expression backfillFrom() builds in scripts/onboard.ts, so the hub and
  -- the CLI cannot disagree about what "13 months ago" means in which timezone.
  p_backfill_depth text,
  -- Default null: a source whose token does not expire (or a caller written
  -- before this migration) passes six arguments and behaves exactly as before.
  p_refresh_secret text default null,
  p_expires_at     timestamptz default null
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
    p_secret, p_refresh_secret, p_expires_at, '{}'::jsonb,
    coalesce(p_config, '{}'::jsonb), p_interval::interval,
    (current_date - p_backfill_depth::interval)::date);
end $$;

-- Against the NEW eight-argument signature. data.attach_source is untouched by
-- this migration, so its own revoke from 20260918000100 still stands.
revoke all on function api.connect_source(text, text, text, jsonb, text, text, text, timestamptz)
  from public, anon, service_role;
grant execute on function api.connect_source(text, text, text, jsonb, text, text, text, timestamptz) to authenticated;
