-- 0032 (HQ v2, PR-B): deliverables -- a queue of "build the demo / quote for <slug>" requests.
-- A signed-in HQ user inserts a queued row; the droplet job (apps/hq/jobs/deliverable.mjs) claims it,
-- runs the os /demo or /quote skill, commits what it wrote under clients/<slug>/ and marks the row done.
-- Authenticated users can read and insert (status='queued', requested_by = themselves) and nothing
-- else: no update/delete grant, so a run's state is only ever moved by the jobs role. anon gets nothing.
-- (0031 belongs to PR-A.)
begin;

create table deliverables (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  kind         text not null check (kind in ('pitch', 'quote')),
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  requested_by uuid not null references profiles (id),
  feedback     text,
  paths        text[] not null default '{}',   -- clients/<slug>/... relative paths the run wrote
  error        text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

-- The job's claim scans only the queue.
create index deliverables_queued_idx on deliverables (created_at) where status = 'queued';

alter table deliverables enable row level security;

create policy hq_select on deliverables for select to authenticated using (public.is_hq());
create policy hq_insert on deliverables for insert to authenticated
  with check (public.is_hq() and status = 'queued' and requested_by = auth.uid());

revoke all on deliverables from anon;
grant select, insert on deliverables to authenticated;
revoke update, delete, truncate, references, trigger on deliverables from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- NATE RUNS THIS BY HAND (never from a migration; the password is typed, not stored here).
-- It replaces the pooler `postgres` login that jobs use today with a role that can only do what
-- apps/hq/jobs does. RLS is on for every table below, so each gets an explicit policy for the role
-- (nothing relies on BYPASSRLS). Then point /srv/hq/jobs.env DATABASE_URL at hq_jobs.
--
--   create role hq_jobs login password '<type a long random password>' nobypassrls nosuperuser;
--   grant usage on schema public to hq_jobs;
--   grant select, insert, update on businesses, search_grid to hq_jobs;
--   grant select, insert on events to hq_jobs;
--   grant usage, select on sequence events_id_seq to hq_jobs;
--   grant select, update on deliverables to hq_jobs;
--   grant select on profiles, clients to hq_jobs;
--   create policy jobs_all    on businesses  for all    to hq_jobs using (true) with check (true);
--   create policy jobs_all    on search_grid for all    to hq_jobs using (true) with check (true);
--   create policy jobs_select on events      for select to hq_jobs using (true);
--   create policy jobs_insert on events      for insert to hq_jobs with check (true);
--   create policy jobs_select on deliverables for select to hq_jobs using (true);
--   create policy jobs_update on deliverables for update to hq_jobs using (true) with check (true);
--   create policy jobs_select on profiles    for select to hq_jobs using (true);
--   create policy jobs_select on clients     for select to hq_jobs using (true);
--
-- Check afterwards: `set role hq_jobs; select count(*) from businesses;` works,
-- `delete from businesses;` and `select * from finance_inputs;` are both "permission denied".
-- ---------------------------------------------------------------------------
