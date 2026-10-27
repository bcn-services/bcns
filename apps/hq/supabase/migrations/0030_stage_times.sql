-- 0030 (HQ item 6): when a lead first reached consult_done / won, so Numbers can bucket pilots and
-- signed by that moment instead of businesses.updated_at (which every later write moves). Also makes
-- finance_snapshots insert-only for signed-in users, so a frozen month stays frozen in the database.
-- (0028/0029 are reserved for items 3 and 4.)
begin;

alter table businesses
  add column consult_done_at timestamptz,
  add column won_at          timestamptz;

-- Stamps once, never clears. consult_done_at also covers won/onboarded: a signed lead had its
-- consult, and the backfill below counts those rows as pilots too. security invoker, search_path ''
-- like businesses_keep_suppressed; it only edits NEW. The stored fit_score column is computed after
-- BEFORE triggers from `research`, which this never touches.
create function public.businesses_stamp_stage_times() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.stage in ('consult_done', 'won', 'onboarded') then
    new.consult_done_at := coalesce(new.consult_done_at, now());
  end if;
  if new.stage in ('won', 'onboarded') then
    new.won_at := coalesce(new.won_at, now());
  end if;
  return new;
end $$;

revoke execute on function public.businesses_stamp_stage_times() from public, anon;
grant execute on function public.businesses_stamp_stage_times() to authenticated;

create trigger businesses_stamp_stage_times_ins before insert on businesses
  for each row execute function public.businesses_stamp_stage_times();
-- Fires on any UPDATE that lists stage (decide_proposal, jobs, the UI); a no-op write keeps the old times.
create trigger businesses_stamp_stage_times_upd before update of stage on businesses
  for each row execute function public.businesses_stamp_stage_times();

-- Backfill: the best record there is for existing rows is their last write.
update businesses set
  consult_done_at = coalesce(consult_done_at, updated_at),
  won_at = case when stage in ('won', 'onboarded') then coalesce(won_at, updated_at) else won_at end
where stage in ('consult_done', 'won', 'onboarded');

-- ---- finance_snapshots: freeze once, in the database ------------------------------------------
-- The app inserts a month and never rewrites it (23505 = already frozen); 0027 also granted UPDATE.
revoke update on finance_snapshots from authenticated;
drop policy hq_update on finance_snapshots;

commit;
