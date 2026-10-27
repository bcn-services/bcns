-- HQ RLS + decide_proposal checks. Rolls back; safe to re-run on the local stack.
--   supabase start --workdir apps/hq   (once; `supabase db reset --workdir apps/hq` for a clean slate)
--   psql 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' -v ON_ERROR_STOP=1 -f apps/hq/supabase/tests/rls.sql
-- Prints "rls.sql: PASS"; any failed assertion raises and psql exits non-zero.
\set ON_ERROR_STOP on
begin;

-- ---- seed (as postgres): two auth users, only u1 has a profile --------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hq-user@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'no-profile@example.test');
insert into profiles (id, email, handle, role)
  values ('00000000-0000-0000-0000-0000000000a1', 'hq-user@example.test', 'nate', 'admin');

insert into businesses (id, name, stage, research, suppressed_at) values
  ('00000000-0000-0000-0000-00000000b001', 'Acme Test Plumbing',   'sourced', '{"fit_score": 7}'::jsonb, null),
  -- double-encoded: a jsonb string containing JSON (what every live row looks like)
  ('00000000-0000-0000-0000-00000000b002', 'Double Heat Test Co',  'sourced', to_jsonb('{"fit_score": 9.5, "x": 1}'::text), null),
  -- garbage: a jsonb string that is not JSON
  ('00000000-0000-0000-0000-00000000b003', 'Garbage Test HVAC',    'sourced', to_jsonb('not json at all'::text), null),
  -- non-numeric fit_score, in both encodings
  ('00000000-0000-0000-0000-00000000b004', 'Words Test Roofing',   'sourced', '{"fit_score": "high"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000b005', 'Words2 Test Roofing',  'sourced', to_jsonb('{"fit_score": "high"}'::text), null),
  ('00000000-0000-0000-0000-00000000b006', 'Array Test Paving',    'sourced', '[1,2]'::jsonb, null),
  ('00000000-0000-0000-0000-00000000b007', 'Suppressed Test Inc',  'sourced', '{}'::jsonb, now());

do $$ begin
  assert (select fit_score from businesses where name = 'Acme Test Plumbing') = 7, 'object fit_score';
  assert (select fit_score from businesses where name = 'Double Heat Test Co') = 9.5, 'double-encoded fit_score';
  assert (select count(*) from businesses where name like '%Test%' and fit_score is null) = 5, 'garbage/non-numeric -> null';
  -- the generated column must also survive an UPDATE to garbage
  update businesses set research = to_jsonb('}{'::text) where name = 'Acme Test Plumbing';
  assert (select fit_score from businesses where name = 'Acme Test Plumbing') is null, 'update to garbage -> null';
  update businesses set research = '{"fit_score": 7}'::jsonb where name = 'Acme Test Plumbing';
  -- widened stage check
  update businesses set stage = 'consult_done' where name = 'Acme Test Plumbing';
  update businesses set stage = 'sourced' where name = 'Acme Test Plumbing';
  begin
    update businesses set stage = 'bogus' where name = 'Acme Test Plumbing';
    raise exception 'bogus stage accepted';
  exception when check_violation then null; end;
end $$;

-- ---- anon: nothing ----------------------------------------------------------
set local role anon;
do $$
declare n int; t text;
begin
  -- "reads 0 rows": either 0 rows or permission denied (grants are revoked)
  foreach t in array array['businesses', 'selectable_businesses', 'clients', 'tasks', 'proposals', 'profiles', 'events', 'mailboxes'] loop
    begin
      execute format('select count(*) from %I', t) into n;
    exception when insufficient_privilege then n := 0; end;
    assert n = 0, 'anon read ' || t;
  end loop;
end $$;
reset role;

-- ---- signed in, no profiles row: nothing ------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
declare n int; t text;
begin
  foreach t in array array['businesses', 'selectable_businesses', 'clients', 'tasks', 'proposals', 'profiles', 'events', 'call_weeks', 'finance_inputs'] loop
    execute format('select count(*) from %I', t) into n;
    assert n = 0, 'no-profile user read ' || t;
  end loop;
  begin
    insert into tasks (title) values ('should fail');
    raise exception 'no-profile user inserted a task';
  exception when insufficient_privilege then null; end;   -- RLS violation = 42501
  begin
    perform decide_proposal(gen_random_uuid(), true);
    raise exception 'no-profile user called decide_proposal';
  exception when insufficient_privilege then null; end;
  begin
    insert into proposals (kind, target_id, field, new, created_by)
      values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"qualified"', '00000000-0000-0000-0000-0000000000a2');
    raise exception 'no-profile user inserted a proposal';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- profile user -----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; t text; t1 uuid;
begin
  assert (select count(*) from businesses) = 7, 'profile user reads businesses';
  assert (select count(*) from selectable_businesses) = 6, 'view hides suppressed';
  assert (select count(*) from profiles) = 1, 'profile user reads profiles';
  -- tables with no policy stay closed even to HQ users (0 rows, or no grant at all)
  foreach t in array array['mailboxes', 'alerts', 'email_threads', 'search_grid'] loop
    begin
      execute format('select count(*) from %I', t) into n;
    exception when insufficient_privilege then n := 0; end;
    assert n = 0, t || ' readable';
  end loop;

  -- tasks: insert/update ok, delete matches 0 rows
  insert into tasks (title, owner) values ('write seed', 'nate') returning id into t1;
  update tasks set status = 'doing' where id = t1;
  assert (select status from tasks where id = t1) = 'doing', 'task update';
  -- delete is denied: 0 rows (RLS, no delete policy) or no DELETE privilege (0027 revokes it)
  begin
    delete from tasks where id = t1;
    get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0; end;
  assert n = 0, 'delete on tasks affected rows';
  assert (select count(*) from tasks where id = t1) = 1, 'task survived delete';
  begin
    delete from businesses where name = 'Acme Test Plumbing';
    get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0; end;
  assert n = 0, 'delete on businesses affected rows';

  -- notes/links need exactly one parent
  begin insert into notes (body) values ('orphan'); raise exception 'orphan note';
  exception when check_violation then null; end;
  insert into notes (body, task_id) values ('ok', t1);
  begin insert into links (label, url, task_id) values ('x', 'http://insecure', t1); raise exception 'http link';
  exception when check_violation then null; end;

  -- suppressed_at cannot be cleared by a signed-in user
  begin
    update businesses set suppressed_at = null where name = 'Suppressed Test Inc';
    raise exception 'cleared suppressed_at';
  exception when insufficient_privilege then null; end;

  -- calls + weekly view
  insert into calls (business_id, "by", outcome, actor) values
    ('00000000-0000-0000-0000-00000000b001', 'nate', 'no_answer', auth.uid()),
    ('00000000-0000-0000-0000-00000000b001', 'nate', 'reached', auth.uid()),
    ('00000000-0000-0000-0000-00000000b001', 'nate', 'consult_booked', auth.uid());
  assert (select calls from call_weeks where "by" = 'nate') = 3 and (select reached from call_weeks where "by" = 'nate') = 2
     and (select consults from call_weeks where "by" = 'nate') = 1, 'call_weeks counts';
  assert (select extract(isodow from week) from call_weeks where "by" = 'nate') = 1, 'week starts Monday';

  -- proposals: insert pending only, as self; never update/delete
  begin
    insert into proposals (kind, target_id, field, new, status, created_by)
      values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"qualified"', 'approved', auth.uid());
    raise exception 'inserted non-pending proposal';
  exception when insufficient_privilege then null; end;
  begin
    insert into proposals (kind, target_id, field, new, created_by)
      values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"qualified"', gen_random_uuid());
    raise exception 'inserted proposal as someone else';
  exception when insufficient_privilege then null; end;
  begin
    insert into proposals (kind, target_id, field, new, created_by)
      values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'name', '"x"', auth.uid());
    raise exception 'lead_stage proposal on non-whitelisted field';
  exception when check_violation then null; end;
end $$;
reset role;
-- the next block keeps going as the profile user
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare p1 uuid; p2 uuid; p3 uuid; f1 uuid; f2 uuid; f3 uuid; me uuid := auth.uid();
begin
  -- direct update of a proposal is denied
  insert into proposals (kind, target_id, field, old, new, created_by)
    values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"sourced"', '"qualified"', me) returning id into p1;
  begin
    update proposals set status = 'approved' where id = p1;
    raise exception 'update proposals allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from proposals where id = p1;
    raise exception 'delete proposals allowed';
  exception when insufficient_privilege then null; end;

  -- approve: applies and records the decider
  assert decide_proposal(p1, true) = 'approved', 'approve returns approved';
  assert (select stage from businesses where id = '00000000-0000-0000-0000-00000000b001') = 'qualified', 'stage applied';
  assert (select decided_by from proposals where id = p1) = me, 'decided_by recorded';
  begin perform decide_proposal(p1, true); raise exception 'decided twice';
  exception when raise_exception then
    if sqlerrm = 'decided twice' then raise; end if;
  end;

  -- compare-and-set: old no longer matches -> stale, nothing applied
  insert into proposals (kind, target_id, field, old, new, created_by)
    values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"sourced"', '"meeting"', me) returning id into p2;
  assert decide_proposal(p2, true) = 'stale', 'mismatch returns stale';
  assert (select stage from businesses where id = '00000000-0000-0000-0000-00000000b001') = 'qualified', 'stale did not apply';
  assert (select status from proposals where id = p2) = 'stale', 'stale recorded';

  -- reject leaves data alone
  insert into proposals (kind, target_id, field, old, new, created_by)
    values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"qualified"', '"attempted"', me) returning id into p3;
  assert decide_proposal(p3, false) = 'rejected', 'reject';
  assert (select stage from businesses where id = '00000000-0000-0000-0000-00000000b001') = 'qualified', 'reject did not apply';

  -- finance: upsert per (week, channel/column); old null = no row yet
  insert into proposals (kind, target_id, field, old, new, created_by)
    values ('finance', '2026-10-19', 'cold_call/spend_cents', null, '500', me) returning id into f1;
  assert decide_proposal(f1, true) = 'approved', 'finance approve';
  insert into proposals (kind, target_id, field, old, new, created_by)
    values ('finance', '2026-10-19', 'cold_call/hours', '0', '2.5', me) returning id into f2;
  assert decide_proposal(f2, true) = 'approved', 'finance second column';
  assert (select spend_cents from finance_inputs where week = '2026-10-19' and channel = 'cold_call') = 500
     and (select hours from finance_inputs where week = '2026-10-19' and channel = 'cold_call') = 2.5, 'finance upsert keeps other columns';
  insert into proposals (kind, target_id, field, old, new, created_by)
    values ('finance', '2026-10-19', 'cold_call/spend_cents', '0', '900', me) returning id into f3;
  assert decide_proposal(f3, true) = 'stale', 'finance stale';
  assert (select spend_cents from finance_inputs where week = '2026-10-19' and channel = 'cold_call') = 500, 'finance stale did not apply';
  begin
    insert into proposals (kind, target_id, field, new, created_by)
      values ('finance', '2026-10-19', 'cold_call/created_at', '1', me);
    raise exception 'finance proposal on non-whitelisted column';
  exception when check_violation then null; end;
end $$;
reset role;

rollback;
\echo rls.sql: PASS
