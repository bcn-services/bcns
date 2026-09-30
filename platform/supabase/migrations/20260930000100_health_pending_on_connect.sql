-- Hub card state: a source with an active token and an enabled schedule reads
-- Connected even before its first sync. api.connector_health_v1 cannot expose the
-- token or schedule (catalog.test.ts tokens_unreachable), so the health row itself
-- carries it: attach_source seeds a never_ran row; revoke_shopify_install deletes it;
-- the worker's computeHealth no longer recreates one for a disabled/revoked source.
-- Signatures unchanged, so CREATE OR REPLACE keeps the existing grants and revokes.

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

  -- A just-connected source reads Connected on the hub before the worker's next
  -- tick: seed the health row the worker would write. Never overwrites a real one.
  insert into data.connector_health (client_id, source, status, status_since)
  values (p_client_id, p_source, 'never_ran', now())
  on conflict (client_id, source) do nothing;
end $$;

create or replace function data.revoke_shopify_install(p_shop text, p_triggered_at timestamptz)
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
  ), hl as (
    -- No health row = the hub reads Not connected (and the install link returns).
    delete from data.connector_health h
    using hit where h.client_id = hit.client_id and h.source = 'shopify'
  )
  select count(*) into n from hit;
  return n;
end $$;
