-- Shopify: access ends when a paid period ends.
--
-- /finish lets a reinstall through when Shopify has no ACTIVE subscription but the
-- Partner API says the store already paid for a period that has not ended yet
-- (apps/connect/lib/shopify-oauth.ts, managedPricingRedirect + paidThrough). Until
-- now that end date was only logged. This stores it, and the worker's paidPeriods
-- step (worker/src/paid-period.ts) re-checks a row once its date has passed: still
-- ACTIVE -> the new period end is stored; really ended -> data.revoke_shopify_install
-- (the uninstall state: token revoked, schedule disabled, data kept).
--
-- One row per tenant (one tenant, one shop). Internal: RLS on and forced, no grant
-- to anon/authenticated/service_role, no policy — no tenant can read any row, its
-- own included. Written only through api.record_shopify_paid_through below (tenant
-- from the JWT, owner only) and by the worker (postgres).

create table data.shopify_paid_through (
  client_id    uuid primary key references data.clients(id) on delete cascade,
  shop         text not null,
  paid_through timestamptz not null,
  -- Last worker re-check; the worker asks Shopify at most about once a day per row.
  checked_at   timestamptz,
  updated_at   timestamptz not null default now()
);
create trigger touch before update on data.shopify_paid_through for each row execute function data.touch_updated_at();

alter table data.shopify_paid_through enable row level security;
alter table data.shopify_paid_through force row level security;
revoke all on data.shopify_paid_through from public, anon, authenticated, service_role;

-- Called by /finish with the owner's session, only after the Partner API confirmed a
-- paid period. The owner could call it directly; the bound keeps a forged date from
-- postponing the re-check by more than a year. A shorter or past date only brings the
-- re-check forward, which re-asks Shopify and never revokes an ACTIVE subscription.
-- ponytail: owner-callable like api.connect_source (whose config the owner also
-- controls). Upgrade to a hub-signed value checked here if an owner ever abuses it.
create function api.record_shopify_paid_through(p_shop text, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if coalesce(p_shop, '') !~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'shop';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '400 days' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'until';
  end if;
  insert into data.shopify_paid_through (client_id, shop, paid_through)
  values (tenant, p_shop, p_until)
  on conflict (client_id) do update set shop = excluded.shop, paid_through = excluded.paid_through, checked_at = null;
end $$;

revoke all on function api.record_shopify_paid_through(text, timestamptz) from public, anon, service_role;
grant execute on function api.record_shopify_paid_through(text, timestamptz) to authenticated;
