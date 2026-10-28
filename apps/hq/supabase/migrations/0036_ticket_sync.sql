-- ---------------------------------------------------------------------------
-- 0036_ticket_sync — two-way ticket sync (jobs/tickets.mjs).
--
-- resolution: what Nate answered; pushed to the ticket source when the task is done.
-- synced_at:  set once the task's close is reflected at the source (pushed, or the source closed it
--             first); null on a done task means "owes a push". Reopen at the source = a new task.
-- ---------------------------------------------------------------------------

begin;

alter table tasks add column resolution text, add column synced_at timestamptz;

commit;

-- ---------------------------------------------------------------------------
-- NATE RUNS THIS BY HAND, after the hq_jobs role from 0032's footer exists (never from a migration).
-- jobs/tickets.mjs reads tasks by alert_key, inserts a task per ticket, and updates status/done_at/
-- synced_at. RLS is on, so the role needs a policy per command. Without these lines every tickets
-- run fails "permission denied" the moment hq_jobs reaches it. No delete grant.
--
--   grant select, insert, update on tasks to hq_jobs;
--   create policy jobs_select on tasks for select to hq_jobs using (true);
--   create policy jobs_insert on tasks for insert to hq_jobs with check (true);
--   create policy jobs_update on tasks for update to hq_jobs using (true) with check (true);
--
-- Check afterwards (read-only; the SQL editor's postgres user cannot `set role hq_jobs`):
--   select has_table_privilege('hq_jobs','tasks','insert')  as ins,            -- true
--          has_table_privilege('hq_jobs','tasks','delete')  as del_should_be_false;  -- false
-- ---------------------------------------------------------------------------
