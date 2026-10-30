-- ---------------------------------------------------------------------------
-- 0040_ticket_reply — reply to a client ticket without closing it (jobs/tickets.mjs).
--
-- reply: text queued for the ticket source; the job pushes it on the next sync (hq_ticket_reply) and
--        sets it back to null. Only read while the task is not done.
-- ---------------------------------------------------------------------------

begin;

alter table tasks add column reply text;

commit;

-- No new grant: 0036's footer already gives hq_jobs select + update on tasks.
