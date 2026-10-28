-- HQ ticket sync (apps/hq job `tickets`). HQ pulls Connect tickets and pushes a resolution back
-- through ONE login role, `hq_tickets`, that can execute exactly two functions in schema `ops` and
-- touches no table. Ticket bodies leave the DB through this role only: the `ops` views stay
-- metadata-only (hq_ops_ro is not widened and sees no body, no resolution).
--
-- The functions are postgres-owned security definer (postgres has BYPASSRLS), so hq_tickets needs no
-- grant on schema data or api. hq_tickets_pull is capped to the last 90 days of updates.
--
-- PASSWORD IS NOT IN THIS FILE. Nate sets it by hand after the push:
--   alter role hq_tickets password '<generated>';
-- and puts it in HQ's jobs env (shape only, never the value; same shape as hq_ops_ro):
--   postgresql://hq_tickets.<ref>:<pw>@<pooler-host>:5432/postgres?sslmode=verify-full
-- Until then the role has no password and cannot log in over the network.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hq_tickets') then
    create role hq_tickets login noinherit nobypassrls connection limit 3;
  end if;
end $$;
-- postgres is not a superuser on Supabase, so re-running only restates attributes it may change.
alter role hq_tickets login noinherit connection limit 3;
alter role hq_tickets set statement_timeout = '5s';

-- Nate's reply. Written only by ops.hq_ticket_resolve below; read by members through api.tickets_v1.
alter table data.tickets
  add column resolution text check (char_length(resolution) <= 4000),
  add column resolved_at timestamptz;

-- Recreated with resolution + resolved_at appended (create or replace view may add columns only at
-- the end, which is where they go). security_invoker: the caller's RLS still scopes it.
create or replace view api.tickets_v1 with (security_invoker = true) as
  select client_id, 'platform'::data.source as source, id, subject, body, severity, status, created_at, updated_at,
         resolution, resolved_at
  from data.tickets;
grant select on api.tickets_v1 to authenticated;

create schema if not exists ops;
revoke all on schema ops from public;

-- Every non-closed ticket, plus closed ones updated in the last 90 days (the window bounds closed
-- tickets only, so an old open ticket still gets its reply), with the workspace slug. HQ closes its
-- task when a ticket it knows has status 'closed' here.
create or replace function ops.hq_tickets_pull()
returns table (id uuid, slug text, subject text, body text, severity text, status text,
               created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, c.slug, t.subject, t.body, t.severity, t.status, t.created_at, t.updated_at
    from data.tickets t
    join data.clients c on c.id = t.client_id
   where t.status <> 'closed' or t.updated_at > now() - interval '90 days'
   order by t.updated_at desc
$$;

-- Closes a ticket with a reply. Returns rows updated: 1 the first time, 0 for an unknown id or an
-- already-closed ticket (so a retry cannot overwrite the reply). An empty text closes without a reply.
create or replace function ops.hq_ticket_resolve(p_id uuid, p_text text)
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update data.tickets
     set resolution = nullif(p_text, ''), resolved_at = now(), status = 'closed'
   where id = p_id and status <> 'closed';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function ops.hq_tickets_pull() from public, anon, authenticated, service_role;
revoke all on function ops.hq_ticket_resolve(uuid, text) from public, anon, authenticated, service_role;
grant usage on schema ops to hq_tickets;
grant execute on function ops.hq_tickets_pull() to hq_tickets;
grant execute on function ops.hq_ticket_resolve(uuid, text) to hq_tickets;
