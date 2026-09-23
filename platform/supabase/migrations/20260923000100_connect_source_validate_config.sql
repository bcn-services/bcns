-- api.connect_source validates p_config per source.
--
-- WHY THIS EXISTS: docs/architecture/chunk5-w5a-shopify-review.md #2 and
-- chunk5-w5b-meta-monday-review.md #5. `grant execute on function
-- api.connect_source(...) to authenticated` (20260918000100) means any signed-in
-- owner can call this RPC straight through PostgREST, and `p_config` is the one
-- parameter of the set that was checked by nothing on either side of the wire —
-- `p_source`, `p_kind`, `p_interval` and `p_backfill_depth` are null-checked and
-- then cast (a bad value raises); `p_secret` is null/empty-checked. Both reviews
-- traced the resulting SSRF/injection paths and found the blast radius capped at
-- "an owner can break their own tenant's sync" (shopifyEndpoint rebuilds the host
-- from the handle rather than trusting `shop` verbatim; meta.ts and monday.ts
-- build the request with a fixed host / a GraphQL variable, never string
-- interpolation) — Low/Informational, not exploitable cross-tenant. Both reviews'
-- smallest fix is the same: validate the known keys per source, beside the
-- existing checks.
--
-- Only api.connect_source ever writes rows for 'shopify' / 'meta' / 'monday' this
-- way (apps/connect/lib/shopify-oauth.ts, meta-oauth.ts, monday-oauth.ts
-- scheduleConfig()). 'meet' and 'drive' are never attached through this RPC —
-- platform/scripts/onboard.ts calls data.attach_source directly, as `postgres`,
-- bypassing api.connect_source entirely — so their config keys (folder_id,
-- oauth_client_id, notes_url) are untouched by this migration and unchecked
-- here, same as before.
--
-- Unknown keys are NOT rejected: neither review recommended an allow-list, only
-- validating the one key each connector actually reads. A source with no known
-- key to check (the "else" case) is passed through exactly as before this
-- migration — matching the reviews' informational (not "must block") severity.
--
-- CREATE OR REPLACE, not drop+recreate: the signature is unchanged from
-- 20260919000100_connect_source_refresh.sql, so postgres keeps the existing
-- grants (EXECUTE for `authenticated` only) automatically. Drop+recreate is only
-- required when the argument list changes (see that migration's own note).

create or replace function api.connect_source(
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

  -- p_config was checked by nothing before this migration — chunk5-w5a-shopify-
  -- review.md #2 / chunk5-w5b-meta-monday-review.md #5. Validate the one key
  -- each connector actually reads, same regex scheduleConfig()'s own inputs are
  -- shaped from on the apps/connect side.
  if p_source = 'shopify' and coalesce(p_config->>'shop', '') !~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.shop';
  end if;
  if p_source = 'meta' and coalesce(p_config->>'act_id', '') !~ '^act_\d+$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.act_id';
  end if;
  if p_source = 'monday' and coalesce(p_config->>'board_id', '') !~ '^\d+$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'config.board_id';
  end if;

  -- `tenant`, never a client id from the request: an owner of A cannot write into B.
  perform data.attach_source(
    tenant, p_source::data.source, p_kind::data.token_kind,
    p_secret, p_refresh_secret, p_expires_at, '{}'::jsonb,
    coalesce(p_config, '{}'::jsonb), p_interval::interval,
    (current_date - p_backfill_depth::interval)::date);
end $$;

-- Signature is unchanged, so no revoke/grant needed — CREATE OR REPLACE leaves
-- the 20260919000100 grants (EXECUTE for `authenticated` only) in place.
