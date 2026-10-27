-- 0030 (HQ item 6): when a lead first reached consult_done / won, so Numbers can bucket pilots and
-- signed by that moment instead of businesses.updated_at (which every later write moves). Also makes
-- finance_snapshots insert-only for signed-in users, so a frozen month stays frozen in the database.
-- (0028/0029 are reserved for items 3 and 4.)
begin;

-- Idempotent on purpose: it was applied to the shared local stack by psql without being recorded, so
-- a later `supabase migration up` re-runs it.
alter table businesses
  add column if not exists consult_done_at timestamptz,
  add column if not exists won_at          timestamptz;

-- Stamps once; clears only when the lead moves back (a mistaken won/consult_done). consult_done_at also covers won/onboarded: a signed lead had its
-- consult, and the backfill below counts those rows as pilots too. security invoker, search_path ''
-- like businesses_keep_suppressed; it only edits NEW. The stored fit_score column is computed after
-- BEFORE triggers from `research`, which this never touches.
create or replace function public.businesses_stamp_stage_times() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.stage in ('consult_done', 'won', 'onboarded') then
    new.consult_done_at := coalesce(new.consult_done_at, now());
  end if;
  if new.stage in ('won', 'onboarded') then
    new.won_at := coalesce(new.won_at, now());
  elsif new.stage <> 'lost' then
    new.won_at := null; -- moved back out of won; lost after won is churn and keeps it
  end if;
  -- moved back before the consult (stage order: 0027 funnel, sourced .. consult_scheduled)
  if new.stage in ('sourced', 'qualified', 'call_due', 'drafted', 'approved', 'sent', 'replied',
                   'attempted', 'reached', 'consult_scheduled') then
    new.consult_done_at := null;
  end if;
  return new;
end $$;

revoke execute on function public.businesses_stamp_stage_times() from public, anon;
grant execute on function public.businesses_stamp_stage_times() to authenticated;

drop trigger if exists businesses_stamp_stage_times_ins on businesses;
create trigger businesses_stamp_stage_times_ins before insert on businesses
  for each row execute function public.businesses_stamp_stage_times();
-- Fires on any UPDATE that lists stage (decide_proposal, jobs, the UI); a no-op write keeps the old times.
drop trigger if exists businesses_stamp_stage_times_upd on businesses;
create trigger businesses_stamp_stage_times_upd before update of stage on businesses
  for each row execute function public.businesses_stamp_stage_times();

-- Backfill (fills nulls only, safe to re-run): the best record there is for existing rows is their last write.
update businesses set
  consult_done_at = coalesce(consult_done_at, updated_at),
  won_at = case when stage in ('won', 'onboarded') then coalesce(won_at, updated_at) else won_at end
where stage in ('consult_done', 'won', 'onboarded');

-- ---- finance_snapshots: freeze once, in the database ------------------------------------------
-- The app inserts a month and never rewrites it (23505 = already frozen); 0027 also granted UPDATE.
revoke update on finance_snapshots from authenticated;
drop policy if exists hq_update on finance_snapshots;

commit;
