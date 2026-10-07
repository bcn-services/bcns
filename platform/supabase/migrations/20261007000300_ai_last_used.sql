-- Hub "get started" checklist: has anyone in this workspace asked an AI about its data yet?
-- The MCP OAuth server is stateless (no grant table); the only persisted signal is one
-- data.mcp_tool_calls row per tool call, which PostgREST cannot reach (only schema api is exposed).
-- Newest call time for the caller's own tenant, null when none. No table changes.
create function api.ai_last_used_at()
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare tenant uuid := data.tenant_or_raise();
begin
  return (select max(c.at) from data.mcp_tool_calls c where c.client_id = tenant);
end $$;

revoke all on function api.ai_last_used_at() from public, anon, service_role;
grant execute on function api.ai_last_used_at() to authenticated;
