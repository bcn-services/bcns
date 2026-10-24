-- One external account = one tenant, for Meta, Monday and QuickBooks (Shopify has had
-- it since 20260929000200). Two tenants bound to one ad account / board / realm share
-- the provider's rate budget and read each other's data through it. For QuickBooks a
-- second Intuit grant may also retire the refresh token the first tenant stored (not
-- confirmed), which is why api.source_in_use exists: the hub asks it BEFORE it
-- exchanges the code (the same early-check pattern as api.shopify_shop_mismatch).
--
-- Identifier per source, read from connector_schedule.config:
--   meta -> act_id, monday -> board_id, quickbooks -> realm_id.
-- Google (meet, drive) is deliberately not guarded: Google keeps up to 100 refresh
-- tokens per account + client, quota is per user, and one folder shared by two
-- businesses is legitimate.
--
-- data.attach_source: after the Shopify block, a connect for an id another client holds
-- with an ACTIVE token raises BCNS6 'source_in_use' (Shopify's is 'shop_in_use': one code
-- = "held by another tenant", the message says which). Same-tenant rebinding, to the same
-- or a different id, stays allowed, and a dead (auth_failed/revoked) holder does not block.
-- Signature unchanged, so CREATE OR REPLACE keeps the existing revokes.
-- Body otherwise copied from 20260930000100; the Shopify block is byte-for-byte.
--
-- The read lives in data (no api function body names source_tokens: catalog.test.ts
-- tokens_unreachable); the api function is the owner-only JWT wrapper, one boolean,
-- never which client holds the id.

create function data.source_in_use(p_client_id uuid, p_source data.source, p_id text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from data.connector_schedule s
    join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
    where s.source = p_source and s.client_id <> p_client_id and tk.status = 'active'
      and s.config->>(case p_source when 'meta' then 'act_id' when 'monday' then 'board_id' when 'quickbooks' then 'realm_id' end) = p_id
  )
$$;

revoke all on function data.source_in_use(uuid, data.source, text) from public, anon, authenticated, service_role;

create or replace function data.attach_source(
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
declare
  shop text := lower(p_config->>'shop');
  id   text := nullif(p_config->>(case p_source when 'meta' then 'act_id' when 'monday' then 'board_id' when 'quickbooks' then 'realm_id' end), '');
begin
  if p_source = 'shopify' and shop is not null then
    -- Serialises two connects for the same shop, so both cannot pass the check below.
    perform pg_advisory_xact_lock(hashtext('attach_source:shopify:' || shop));
    if exists (
      select 1 from data.connector_schedule s
      join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
      where s.source = 'shopify' and s.client_id <> p_client_id and tk.status = 'active'
        and lower(s.config->>'shop') = shop
    ) then
      raise exception using errcode = 'BCNS6', message = 'shop_in_use';
    end if;
    -- One tenant, one shop: never overwrite a different shop's connection.
    if exists (
      select 1 from data.connector_schedule s
      where s.source = 'shopify' and s.client_id = p_client_id
        and lower(s.config->>'shop') <> shop
    ) then
      raise exception using errcode = 'BCNS7', message = 'shop_mismatch';
    end if;
  end if;

  if id is not null then
    -- Serialises two connects for the same account/board/realm, so both cannot pass the check.
    perform pg_advisory_xact_lock(hashtext('attach_source:' || p_source::text || ':' || id));
    if data.source_in_use(p_client_id, p_source, id) then
      raise exception using errcode = 'BCNS6', message = 'source_in_use';
    end if;
  end if;

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

  -- backfill_from and the cursors stay (see 20260918000100); the error a reconnect
  -- just fixed and an uninstall's enabled = false do not.
  insert into data.connector_schedule (client_id, source, interval, backfill_from, backfill_cursor, config, next_run_at)
  values (p_client_id, p_source, p_interval, p_backfill_from, '{}'::jsonb, coalesce(p_config, '{}'::jsonb), now())
  on conflict (client_id, source) do update set
    config = excluded.config, last_error = null, last_error_at = null, enabled = true;

  -- A just-connected source reads Connected on the hub before the worker's next
  -- tick: seed the health row the worker would write. Never overwrites a real one.
  insert into data.connector_health (client_id, source, status, status_since)
  values (p_client_id, p_source, 'never_ran', now())
  on conflict (client_id, source) do nothing;
end $$;

-- Tenant from the JWT, owner only, like api.shopify_shop_mismatch. A source this guard
-- does not cover (or a bad name) is false, not an error: compared as text before the cast.
create function api.source_in_use(p_source text, p_id text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_source not in ('meta', 'monday', 'quickbooks') then
    return false;
  end if;
  return data.source_in_use(tenant, p_source::data.source, p_id);
end $$;

revoke all on function api.source_in_use(text, text) from public, anon, service_role;
grant execute on function api.source_in_use(text, text) to authenticated;
