-- HQ (apps/hq, Numbers > Ops) reads connector health, recent runs, open tickets and the tenant list
-- through ONE read-only login role and four METADATA-ONLY views in schema `ops`.
--
-- What the views never carry: error text (connector_health.last_error, connector_runs.error), ticket
-- bodies, tokens/secrets, record or order data, per-tenant business rows. Names, slugs, status and
-- timestamps only. The views are postgres-owned and NOT security_invoker, so they run as postgres
-- (BYPASSRLS) and hq_ops_ro needs no grant on schema data and none on schema api. It gets USAGE on
-- `ops` and SELECT on those four views, nothing else.
--
-- PASSWORD IS NOT IN THIS FILE. Nate sets it by hand after the push:
--   alter role hq_ops_ro password '<generated>';
-- and puts it in HQ's env as PLATFORM_OPS_URL
--   (postgresql://hq_ops_ro:<pw>@<host>:5432/postgres?sslmode=require, shape only).
-- Until then the role has no password and cannot log in over the network.

-- Role: login, no inheritance, no bypassrls, 3 connections (HQ opens max 2), 5 s statements.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hq_ops_ro') then
    create role hq_ops_ro login noinherit nobypassrls connection limit 3;
  end if;
end $$;
-- postgres is not a superuser on Supabase, so re-running only restates attributes it may change.
alter role hq_ops_ro login noinherit connection limit 3;
alter role hq_ops_ro set statement_timeout = '5s';

create schema if not exists ops;
revoke all on schema ops from public;

create or replace view ops.connector_health as
  select c.slug, h.source::text as source, h.status::text as status, h.status_since,
         h.last_run_at, h.last_success_at, (h.last_error is not null) as has_error
    from data.connector_health h
    join data.clients c on c.id = h.client_id;

create or replace view ops.connector_runs_7d as
  select c.slug, r.source::text as source, r.started_at, (r.status = 'ok') as ok,
         (extract(epoch from (r.finished_at - r.started_at)) * 1000)::bigint as duration_ms
    from data.connector_runs r
    join data.clients c on c.id = r.client_id
   where r.started_at >= now() - interval '7 days'
     and r.status <> 'running';

create or replace view ops.tickets_open as
  select t.id, c.slug, t.subject, t.severity, t.status, t.created_at
    from data.tickets t
    join data.clients c on c.id = t.client_id
   where t.status = 'open';

create or replace view ops.clients as
  select slug, name, status::text as status, created_at from data.clients;

revoke all on all tables in schema ops from public, anon, authenticated, service_role;
grant usage on schema ops to hq_ops_ro;
grant select on all tables in schema ops to hq_ops_ro;
