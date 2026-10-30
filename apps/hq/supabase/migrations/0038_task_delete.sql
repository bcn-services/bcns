-- 0038_task_delete — an admin can delete a task from the Work drawer (deleteTask in lib/tasks.ts).
-- 0027 revoked DELETE on every table from authenticated; give back exactly the three the action touches.
-- tasks already has tasks_admin_all (for all, is_admin()); notes and links get admin-only delete policies.
-- Members have no delete policy, so a member's DELETE still removes nothing. Push BEFORE merging the PR.
begin;

grant delete on tasks, notes, links to authenticated;

create policy admin_delete on notes for delete to authenticated using (public.is_admin());
create policy admin_delete on links for delete to authenticated using (public.is_admin());

commit;
