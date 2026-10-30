-- 0038_task_delete — an admin can delete a task from the Work drawer (deleteTask in lib/tasks.ts).
-- 0027 revoked DELETE on every table from authenticated; give back exactly the three the action touches.
-- All three get an admin-only delete policy (0005's tasks_admin_all went with 0017's drop table; 0027 has no tasks delete policy).
-- Members have no delete policy, so a member's DELETE still removes nothing. Push BEFORE merging the PR.
begin;

grant delete on tasks, notes, links to authenticated;

create policy admin_delete on tasks for delete to authenticated using (public.is_admin());
create policy admin_delete on notes for delete to authenticated using (public.is_admin());
create policy admin_delete on links for delete to authenticated using (public.is_admin());

commit;
