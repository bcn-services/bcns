-- The early form of attach_source's BCNS6 check (20260930000100), same predicate.
-- /finish asks this BEFORE it exchanges Shopify's code: the exchange is a new grant,
-- and a new grant retires the refresh token another tenant has stored for the shop.
-- Asking after (at the write) would refuse the connect with that tenant already dead.
-- Tenant from the JWT, owner only, like api.shopify_shop_mismatch. One boolean, never
-- which client holds the shop.

-- The read lives in data: no api function body names source_tokens
-- (catalog.test.ts tokens_unreachable). Not security definer, like attach_source:
-- the one caller is the definer below.
create function data.shopify_shop_in_use(p_client_id uuid, p_shop text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from data.connector_schedule s
    join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
    where s.source = 'shopify' and s.client_id <> p_client_id and tk.status = 'active'
      and lower(s.config->>'shop') = lower(p_shop)
  )
$$;

create function api.shopify_shop_in_use(p_shop text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  return data.shopify_shop_in_use(tenant, p_shop);
end $$;

revoke all on function data.shopify_shop_in_use(uuid, text) from public, anon, authenticated, service_role;
revoke all on function api.shopify_shop_in_use(text) from public, anon, service_role;
grant execute on function api.shopify_shop_in_use(text) to authenticated;
