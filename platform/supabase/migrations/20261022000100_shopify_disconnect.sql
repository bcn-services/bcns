-- Owner Disconnect for Shopify, beside quickbooks, meet, drive, monday and meta.
-- Supersedes the "Shopify stays refused (BCNS3)" note in 20261007000500_source_disconnect.sql.
--
-- Why: the App Store reviewer's second store hit BCNS7 (shop_mismatch) with no self-serve way
-- out; only an ops shop/redact cleared the row. Disconnect is that exit (BCNS7 self-serve).
-- The hub's POST /api/sources/shopify/disconnect calls api.disconnect_source as the owner;
-- the worker's revokeDisconnected step (platform/worker/src/disconnect.ts) then revokes the
-- app's access on Shopify's side and deletes the shop's token, schedule, health row and data.
--
-- Only the allow-list changes; data.disconnect_source is source-generic and unchanged. It also
-- overwrites a token already revoked by app/uninstalled, so a dead-token card can disconnect.
--
-- BCNS7 is intentionally unchanged: after Disconnect the schedule row lingers until the worker
-- deletes it (<~10 min), and a reinstall in that window is still refused on purpose, because
-- attach_source would reset status_detail and the worker would never purge the old store's rows.
--
-- The sb-bridge row (the one store on the bcns-data app, config.app = 'bcns-data', shop
-- fa8a00-11.myshopify.com; see worker/src/privacy.ts) is refused here (BCNS3), as shop/redact
-- never auto-deletes it either. The worker re-checks the same marker before it deletes.

create or replace function api.disconnect_source(p_source data.source)
returns int language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_source is null or p_source not in ('quickbooks', 'meet', 'drive', 'monday', 'meta', 'shopify') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;
  if p_source = 'shopify' and exists (
    select 1 from data.connector_schedule s
    where s.client_id = tenant and s.source = 'shopify'
      and (s.config->>'app' = 'bcns-data' or lower(s.config->>'shop') = 'fa8a00-11.myshopify.com')
  ) then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;
  return data.disconnect_source(tenant, p_source);
end $$;

revoke all on function api.disconnect_source(data.source) from public, anon, service_role;
grant execute on function api.disconnect_source(data.source) to authenticated;
