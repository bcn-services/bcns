-- 0030 checks: stage moves stamp consult_done_at / won_at once and never clear them; frozen months
-- cannot be rewritten by a signed-in user. Rolls back; safe to re-run on the local stack.
--   psql 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' -v ON_ERROR_STOP=1 -f apps/hq/supabase/tests/stage_times.sql
-- Prints "stage_times.sql: PASS".
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000006a1', 'hq6-user@example.test');
insert into profiles (id, email, handle, role)
  values ('00000000-0000-0000-0000-0000000006a1', 'hq6-user@example.test', 'nate', 'admin');
insert into finance_snapshots (month, data) values ('2020-01-01', '{"rows": []}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}', true);
do $$
declare t1 timestamptz; t2 timestamptz; n int;
begin
  insert into businesses (name, stage) values ('hq6 Stage Test Plumbing', 'reached');
  assert (select consult_done_at is null and won_at is null from businesses where name = 'hq6 Stage Test Plumbing'), 'untouched before consult';

  update businesses set stage = 'consult_done' where name = 'hq6 Stage Test Plumbing';
  select consult_done_at, won_at into t1, t2 from businesses where name = 'hq6 Stage Test Plumbing';
  assert t1 is not null and t2 is null, 'consult_done stamps consult_done_at only';

  update businesses set stage = 'won' where name = 'hq6 Stage Test Plumbing';
  assert (select won_at is not null and consult_done_at = t1 from businesses where name = 'hq6 Stage Test Plumbing'), 'won stamps won_at, keeps consult_done_at';
  select won_at into t2 from businesses where name = 'hq6 Stage Test Plumbing';

  perform pg_sleep(0.01);
  update businesses set stage = 'onboarded' where name = 'hq6 Stage Test Plumbing';
  update businesses set stage = 'lost' where name = 'hq6 Stage Test Plumbing';
  assert (select consult_done_at = t1 and won_at = t2 from businesses where name = 'hq6 Stage Test Plumbing'), 'later moves keep both times, never clear them';

  -- a straight insert at a late stage is stamped too
  insert into businesses (name, stage) values ('hq6 Stage Test HVAC', 'won');
  assert (select consult_done_at is not null and won_at is not null from businesses where name = 'hq6 Stage Test HVAC'), 'insert at won stamps both';

  -- frozen months: readable, insertable, not updatable
  assert (select count(*) from finance_snapshots where month = '2020-01-01') = 1, 'snapshot readable';
  begin
    update finance_snapshots set data = '{"rows": [1]}' where month = '2020-01-01';
    raise exception 'authenticated rewrote a frozen month';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
\echo stage_times.sql: PASS
