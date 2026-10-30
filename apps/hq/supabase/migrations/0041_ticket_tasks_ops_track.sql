-- Ticket tasks (source 'alert', alert_key 'ticket:%') belong on the Ops track, not Miscellaneous.
-- Idempotent: only touches rows with no track yet.
update tasks
   set track_id = (select id from tracks where name = 'Ops')
 where source = 'alert' and alert_key like 'ticket:%' and track_id is null;
