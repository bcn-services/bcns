-- One Shopify shop, one live tenant. A NEW grant (code exchange) for an app+shop
-- invalidates the refresh token Shopify issued before it, so a second tenant that
-- completes the install-initiated flow for a shop another tenant already holds
-- kills the holder's connection an hour later (2026-09-29 incident: SB's owner
-- bound bcns-data-dev.myshopify.com, "Shopify Review"'s next refresh got
-- "This request requires an active refresh_token").
--
-- data.attach_source — the one write path, under api.connect_source and the
-- operator CLI — now refuses a shopify row when a DIFFERENT client holds the same
-- shop with an 'active' token: errcode BCNS6, message 'shop_in_use'. PostgREST
-- surfaces that as error.code = 'BCNS6'; apps/connect's /finish maps it to
-- /?error=shop-in-use. The same client reconnecting its own shop passes, and an
-- auth_failed holder does not block (its credential is already dead). The check
-- lives here, not in api.connect_source, because no api function body may name
-- data.source_tokens (catalog.test.ts tokens_unreachable).
--
-- Not a unique index: prod already has a duplicate dead row for one shop, and a
-- dead holder must not block a live connect.
--
-- It also clears connector_schedule.last_error on reconnect, so a token-refresh
-- auth failure the worker wrote there (run.ts refreshOne) stops showing on the
-- hub card once the owner fixes it.

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
  -- just fixed does not.
  insert into data.connector_schedule (client_id, source, interval, backfill_from, backfill_cursor, config, next_run_at)
  values (p_client_id, p_source, p_interval, p_backfill_from, '{}'::jsonb, coalesce(p_config, '{}'::jsonb), now())
  on conflict (client_id, source) do update set
    config = excluded.config, last_error = null, last_error_at = null;
end $$;

-- Signature unchanged, so CREATE OR REPLACE keeps the existing revokes in place.
