-- clients.app_url — where "Open your dashboard" in apps/connect points.
--
-- Optional: a client with no app of its own leaves it null and the hub falls
-- back to the https://<slug>.bcn-services.com convention (apps/connect
-- lib/sources.ts dashboardUrl). The check keeps it an https URL on a plain
-- hostname, so the column can never be rendered as a javascript: or data: href.
alter table data.clients
  add column app_url text
  check (app_url is null or app_url ~ '^https://[a-z0-9.-]+(/.*)?$');

-- Append app_url to the client view. Postgres only allows CREATE OR REPLACE VIEW
-- to ADD columns at the END of the select list, so app_url goes last and every
-- existing column keeps its position and type. Replace preserves the view's
-- privileges, so the `grant select on all tables in schema api to authenticated`
-- from 20260912000400_api_views.sql still stands — no grant is repeated here.
create or replace view api.client_v1 with (security_invoker = true) as
  select id as client_id, 'platform'::data.source as source, name, slug, timezone, status,
         egress_quota_bytes, updated_at, app_url
  from data.clients;
