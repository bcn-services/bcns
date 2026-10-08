-- Owner disconnect for meet, drive, monday and meta, beside QuickBooks
-- (20261002000100_quickbooks_disconnect.sql, whose "QuickBooks only" note this supersedes).
-- The hub's POST /api/sources/<source>/disconnect (which replaces
-- /api/oauth/quickbooks/disconnect) calls api.disconnect_source as the owner; the worker's
-- revokeDisconnected step (platform/worker/src/disconnect.ts) then revokes the token upstream
-- (Intuit; Google's revoke endpoint for meet/drive unless the other Google source is still
-- connected; Meta DELETE /me/permissions; Monday has no revoke endpoint) and deletes that
-- source's token row, schedule, health row and data for the client.
--
-- Only the allow-list changes. data.disconnect_source was already source-generic and is
-- unchanged. Shopify stays refused (BCNS3): its own uninstall path (record_app_uninstalled)
-- owns it. data.notifications.kind is unconstrained text, so the per-source
-- '<source>_revoke_stuck' kinds need no schema change.

create or replace function api.disconnect_source(p_source data.source)
returns int language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_source is null or p_source not in ('quickbooks', 'meet', 'drive', 'monday', 'meta') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;
  return data.disconnect_source(tenant, p_source);
end $$;

revoke all on function api.disconnect_source(data.source) from public, anon, service_role;
grant execute on function api.disconnect_source(data.source) to authenticated;

-- Between Disconnect and the worker's delete the hub shows the source as Disconnecting, not
-- "Not connected / Request connection". Disconnecting = the token is 'revoked' with
-- status_detail 'owner_disconnect' (revokeDisconnected deletes that row last, with the data).
-- Only the source names leave: no other column of the token row. The data half holds the
-- source_tokens read because no api function body may name it (catalog.test.ts tokens_unreachable).
create function data.disconnecting_sources(p_client_id uuid)
returns setof data.source language sql stable set search_path = '' as $$
  select distinct t.source from data.source_tokens t
  where t.client_id = p_client_id and t.status = 'revoked' and t.status_detail = 'owner_disconnect'
  order by t.source
$$;

revoke all on function data.disconnecting_sources(uuid) from public, anon, authenticated, service_role;

-- Tenant from the JWT; owners and members alike (the Sources card is shown to both).
create function api.disconnecting_sources_v1()
returns setof data.source language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  return query select * from data.disconnecting_sources(tenant);
end $$;

revoke all on function api.disconnecting_sources_v1() from public, anon, service_role;
grant execute on function api.disconnecting_sources_v1() to authenticated;
