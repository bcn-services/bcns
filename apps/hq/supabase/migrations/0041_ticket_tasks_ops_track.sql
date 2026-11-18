-- Ticket tasks (source 'alert', alert_key 'ticket:%') belong on the Ops track, not Miscellaneous.
-- Idempotent: only touches rows with no track yet.
update tasks
   set track_id = (select id from tracks where name = 'Ops')
 where source = 'alert' and alert_key like 'ticket:%' and track_id is null;

-- ---------------------------------------------------------------------------
-- NATE RUNS THIS BY HAND, after the hq_jobs role from 0032's footer exists (never from a migration).
-- jobs/tickets.mjs sets a ticket task's track_id from `(select id from tracks where name = 'Ops')`
-- (bcns #221). RLS is on for tracks (0035) and grants there are for `authenticated` only, so without
-- these two lines every tickets run fails "permission denied for table tracks" and no ticket syncs.
-- Both lines are needed: the grant alone leaves the subquery empty and tasks land untracked.
-- Run on the HQ project 2026-11-18. Read only; no insert/update/delete.
--
--   grant select on tracks to hq_jobs;
--   create policy jobs_select on tracks for select to hq_jobs using (true);
--
-- Check afterwards (read-only):
--   select has_table_privilege('hq_jobs','tracks','select');  -- true
-- ---------------------------------------------------------------------------
