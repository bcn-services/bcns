-- Shopify App Store rule 1.2.2 (charge re-approval on reinstall), database half.
-- The hub half is apps/connect: /finish now checks the subscription on every
-- install-initiated finish, and /api/webhooks/shopify/app-uninstalled forwards
-- Shopify's app/uninstalled to the shopify-shop-redact Edge Function, which calls
-- api.record_app_uninstalled below.
--
-- 1. data.attach_source refuses a shopify connect when THIS client is already bound
--    to a DIFFERENT shop: errcode BCNS7, message 'shop_mismatch' (/finish maps it to
--    /?error=shop-mismatch). Before, the upsert silently replaced the first shop's
--    token and config while its synced rows stayed. Refused whatever the old token's
--    status — a dead token does not make the old shop's data this shop's. A tenant
--    whose shop/redact ran has no schedule row left (worker privacy.ts deletes it),
--    so it is not locked out. An operator who really is moving a tenant to another
--    shop deletes the old source first.
--    api.shopify_shop_mismatch lets /finish ask the same question BEFORE it sends an
--    install to Shopify's plan page, so a second-shop install is refused before the
--    merchant can approve a charge for it. It answers one boolean about the caller's
--    own client (tenant from the JWT, owner only) — never a shop, a token or a
--    client id. attach_source's check stays the authority; this is the early exit.
--
-- 2. data.attach_source re-enables the schedule on reconnect. An uninstall (3) is
--    the one thing in the codebase that sets enabled = false, and a reinstall must
--    undo it. The cost: an operator who disabled a schedule by hand loses that on
--    the owner's next reconnect. A reconnect is the owner explicitly asking for the
--    source to run, and a client that must not run is paused on clients.status,
--    which the worker's claim also checks.
--
-- 3. api.record_app_uninstalled -> data.revoke_shopify_install: for one shop, on
--    PUBLIC-app rows only (config->>'app' is null; the bridge app's rows carry
--    app = 'bcns-data' and belong to a different Shopify app, whose uninstall this
--    webhook never reports), set the token 'revoked' and the schedule disabled. The
--    worker's claim skips both (run.ts: s.enabled, tk.status = 'active') and
--    refreshTokens never picks a revoked token up, so nothing calls Shopify with a
--    dead credential. A revoked token is also "not active" to the shop/redact
--    dead-token guard (privacy.ts), so the redact Shopify sends 48h later erases.
--    Split in two for the same reason as connect_source/attach_source: no api
--    function body may name data.source_tokens (catalog.test.ts tokens_unreachable).

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
declare shop text := lower(p_config->>'shop');
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
end $$;

-- Signature unchanged, so CREATE OR REPLACE keeps the existing revokes in place.

create function data.revoke_shopify_install(p_shop text, p_triggered_at timestamptz)
returns int language plpgsql set search_path = '' as $$
declare n int;
begin
  -- Same lock as attach_source, so an uninstall and a reinstall of one shop cannot interleave.
  perform pg_advisory_xact_lock(hashtext('attach_source:shopify:' || lower(p_shop)));
  with hit as (
    select s.client_id
    from data.connector_schedule s
    join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
    where s.source = 'shopify' and lower(s.config->>'shop') = lower(p_shop)
      and s.config->>'app' is null
      -- A late or retried delivery must not revoke a REINSTALL. An 'active' token row
      -- is only ever written by a grant or a refresh Shopify accepted, so one written
      -- after the uninstall happened belongs to a newer install.
      -- ponytail: p_triggered_at is Shopify's clock from an unsigned header, compared
      -- with ours — a skewed or forged value can at worst skip a revoke (the row then
      -- goes auth_failed on its next refresh) or revoke a live row of a shop whose
      -- signed body the caller already holds. Upgrade to comparing against the grant
      -- time Shopify reports if that ever bites.
      and not (tk.status = 'active' and tk.updated_at > p_triggered_at)
      -- Idempotent: a replay finds nothing left to change and touches no row.
      and (tk.status <> 'revoked' or s.enabled)
  ), tok as (
    update data.source_tokens tk set status = 'revoked', status_detail = 'app uninstalled'
    from hit where tk.client_id = hit.client_id and tk.source = 'shopify'
  ), sch as (
    update data.connector_schedule s set enabled = false
    from hit where s.client_id = hit.client_id and s.source = 'shopify'
  )
  select count(*) into n from hit;
  return n;
end $$;

revoke all on function data.revoke_shopify_install(text, timestamptz) from public, anon, authenticated, service_role;

-- Returns how many connections it revoked: 0 for an unknown shop, a replay, a
-- bridge-app row or a reinstall newer than the event. Never a token or a client id.
create function api.record_app_uninstalled(p_shop text, p_triggered_at timestamptz)
returns int language sql security definer set search_path = '' as $$
  select data.revoke_shopify_install(p_shop, p_triggered_at);
$$;

-- N1 (20260924000300): service_role's EXECUTE surface in `api` stays an explicit
-- allow-list — record_shop_redact and, now, this.
revoke all on function api.record_app_uninstalled(text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function api.record_app_uninstalled(text, timestamptz) to service_role;

-- The early form of attach_source's BCNS7 check, same predicate. Tenant from the
-- JWT, owner only, like api.connect_source.
create function api.shopify_shop_mismatch(p_shop text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  return exists (
    select 1 from data.connector_schedule s
    where s.source = 'shopify' and s.client_id = tenant
      and lower(s.config->>'shop') <> lower(p_shop)
  );
end $$;

revoke all on function api.shopify_shop_mismatch(text) from public, anon, service_role;
grant execute on function api.shopify_shop_mismatch(text) to authenticated;
