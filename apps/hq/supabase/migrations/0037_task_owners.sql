-- ---------------------------------------------------------------------------
-- 0037_task_owners — a task can belong to several people: tasks.owners text[] replaces tasks.owner.
--
-- ADDITIVE ON PURPOSE. The deployed HQ still reads and writes `owner`, and a merge to main deploys
-- the new code (which uses `owners`) a few minutes after this lands. So `owner` stays for now and a
-- trigger keeps the two in step in both directions: old code writing `owner` fills `owners`, new code
-- writing `owners` fills `owner` (its first element). Push this file BEFORE merging the PR.
-- Once the new code is live, drop the old column in a follow-up (footer).
-- ---------------------------------------------------------------------------

begin;

alter table tasks
  add column owners text[] not null default '{}'
    check (owners <@ array['nate', 'brandon', 'claude']);

update tasks set owners = array[owner] where owner is not null;

create index tasks_owners_idx on tasks using gin (owners);

create function public.tasks_sync_owner() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.owners = old.owners and new.owner is distinct from old.owner then
    new.owners := coalesce(array[new.owner], '{}');  -- old code wrote `owner` only
  elsif tg_op = 'INSERT' and new.owners = '{}' and new.owner is not null then
    new.owners := array[new.owner];
  end if;
  new.owner := new.owners[1];
  return new;
end $$;

create trigger tasks_sync_owner before insert or update on tasks
  for each row execute function public.tasks_sync_owner();

commit;

-- ---------------------------------------------------------------------------
-- FOLLOW-UP, once the new HQ code has been live for a deploy (0038):
--   drop trigger tasks_sync_owner on tasks;
--   drop function public.tasks_sync_owner();
--   drop index tasks_owner_status_idx;
--   alter table tasks drop column owner;
-- ---------------------------------------------------------------------------
