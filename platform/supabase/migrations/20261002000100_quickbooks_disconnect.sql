-- Owner-initiated QuickBooks disconnect, database half. The hub's
-- POST /api/oauth/quickbooks/disconnect calls api.disconnect_source as the owner;
-- the worker's revokeDisconnected step (platform/worker/src/disconnect.ts) then
-- revokes the token at Intuit and deletes the token row, the schedule, the health
-- row and the client's QuickBooks data.
--
-- The hub never reads the token: it only flips state here. Tokens leave the
-- database only to the worker (apps/web/lib/content.ts privacy copy).
--
-- data.disconnect_source: token 'revoked' (status_detail 'owner_disconnect'),
-- schedule disabled, health row deleted so the card reads Not connected at once
-- (computeHealth never recreates one for a revoked token). Same shape as
-- data.revoke_shopify_install. The worker's claim, refreshTokens and
-- probeAuthFailed all skip a revoked token, so nothing syncs in between.
-- A reconnect before the worker gets to it is just attach_source: token back to
-- 'active', schedule re-enabled, and the worker's revoke step no longer matches.
--
-- Split from the api function because no api function body may name
-- data.source_tokens (catalog.test.ts tokens_unreachable).
--
-- QuickBooks only: Shopify has its own uninstall path (record_app_uninstalled) and
-- the other sources have no worker revoke step yet.

create function data.disconnect_source(p_client_id uuid, p_source data.source)
returns int language plpgsql set search_path = '' as $$
declare n int;
begin
  update data.source_tokens set status = 'revoked', status_detail = 'owner_disconnect'
  where client_id = p_client_id and source = p_source;
  get diagnostics n = row_count;
  update data.connector_schedule set enabled = false
  where client_id = p_client_id and source = p_source;
  delete from data.connector_health where client_id = p_client_id and source = p_source;
  return n;
end $$;

revoke all on function data.disconnect_source(uuid, data.source) from public, anon, authenticated, service_role;

-- Tenant from the JWT, owner only, like api.connect_source. Returns how many token
-- rows it revoked (0 = nothing was connected). Never a token or a client id.
create function api.disconnect_source(p_source data.source)
returns int language plpgsql security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  if data.active_client_role() is distinct from 'owner' then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  if p_source is distinct from 'quickbooks' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'source';
  end if;
  return data.disconnect_source(tenant, p_source);
end $$;

revoke all on function api.disconnect_source(data.source) from public, anon, service_role;
grant execute on function api.disconnect_source(data.source) to authenticated;
