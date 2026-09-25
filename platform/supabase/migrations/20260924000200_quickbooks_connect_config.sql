-- api.connect_source validates p_config->>'realm_id' for quickbooks, same pattern
-- as 20260923000100_connect_source_validate_config.sql's shop/act_id/board_id
-- checks. Separate migration from 20260924000100_quickbooks_enums.sql because
-- Postgres refuses to use a newly-added enum value in the same transaction that
-- added it, and 'quickbooks'::data.source appears in this function body.
--
-- Only api.connect_source writes 'quickbooks' rows (apps/connect/lib/quickbooks-oauth.ts
-- connectArgs()). realm_id is QuickBooks' numeric company id, arriving on the
-- OAuth callback query string — no picker, no extra API call from the hub.

create or replace function api.connect_source(
  p_source         text,
  p_kind           text,
  p_secret         text,
  p_config         jsonb,
  p_interval       text,
  p_backfill_depth text,
  p_refresh_secret text default null,
  p_expires_at     timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_secret is null or length(p_secret) = 0 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'secret';
  end if;
  if p_source is null or p_kind is null or p_interval is null or p_backfill_depth is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;

  if p_source = 'shopify' and coalesce(p_config->>'shop', '') !~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.shop';
  end if;
  if p_source = 'meta' and coalesce(p_config->>'act_id', '') !~ '^act_\d+$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.act_id';
  end if;
  if p_source = 'monday' and coalesce(p_config->>'board_id', '') !~ '^\d+$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.board_id';
  end if;
  if p_source = 'quickbooks' and coalesce(p_config->>'realm_id', '') !~ '^[0-9]{1,32}$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.realm_id';
  end if;

  perform data.attach_source(
    tenant, p_source::data.source, p_kind::data.token_kind,
    p_secret, p_refresh_secret, p_expires_at, '{}'::jsonb,
    coalesce(p_config, '{}'::jsonb), p_interval::interval,
    (current_date - p_backfill_depth::interval)::date);
end $$;

-- Signature unchanged, so CREATE OR REPLACE keeps the existing grants in place.
