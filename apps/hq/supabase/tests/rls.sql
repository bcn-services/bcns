-- HQ RLS + decide_proposal checks. Rolls back; safe to re-run on the local stack.
--   supabase start --workdir apps/hq   (once; `supabase db reset --workdir apps/hq` for a clean slate)
--   psql 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' -v ON_ERROR_STOP=1 -f apps/hq/supabase/tests/rls.sql
-- Prints "rls.sql: PASS"; any failed assertion raises and psql exits non-zero.
\set ON_ERROR_STOP on
begin;

-- ---- seed (as postgres): two auth users, only u1 has a profile --------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hq-user@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'no-profile@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff@example.test');
insert into profiles (id, email, handle, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'hq-user@example.test', 'nate', 'admin'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff@example.test', 'brandon', 'staff');

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
-- the lock-down itself (fails if 0027's revokes / security_invoker are reverted)
do $$ begin
  assert not has_table_privilege('anon', 'public.businesses', 'select'), 'anon has SELECT on businesses';
  assert not has_table_privilege('anon', 'public.selectable_businesses', 'select'), 'anon has SELECT on selectable_businesses';
  assert (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.selectable_businesses'::regclass),
    'selectable_businesses is not security_invoker';
end $$;
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
do $$ begin
  assert not has_function_privilege('anon', 'public.decide_proposal(uuid,boolean)', 'execute'), 'anon can execute decide_proposal';
  assert not has_function_privilege('anon', 'public.is_hq()', 'execute'), 'anon can execute is_hq';
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
  assert (select count(*) from businesses where id::text like '00000000-0000-0000-0000-00000000b%') = 7, 'profile user reads businesses';
  assert (select count(*) from selectable_businesses where id::text like '00000000-0000-0000-0000-00000000b%') = 6, 'view hides suppressed';
  assert (select count(*) from profiles where id = '00000000-0000-0000-0000-0000000000a1') = 1, 'profile user reads profiles';
  -- tables with no policy stay closed even to HQ users (0 rows, or no grant at all)
  foreach t in array array['mailboxes', 'alerts', 'email_threads', 'search_grid'] loop
    begin
      execute format('select count(*) from %I', t) into n;
    exception when insufficient_privilege then n := 0; end;
    assert n = 0, t || ' readable';
  end loop;

  -- generated fit_score works for a signed-in writer (hq_fit_score is not executable by PUBLIC)
  insert into businesses (name, research) values ('Signed In Test Roofing', to_jsonb('{"fit_score": 4}'::text));
  update businesses set research = '{"fit_score": 5}'::jsonb where name = 'Signed In Test Roofing';
  assert (select fit_score from businesses where name = 'Signed In Test Roofing') = 5, 'authenticated write computes fit_score';

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
declare p1 uuid; p2 uuid; p3 uuid; p4 uuid; f1 uuid; f2 uuid; f3 uuid; f4 uuid; me uuid := auth.uid();
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

  -- 0031: old and via are server-set. The caller's old ('sourced') is ignored: it becomes the live
  -- stage; via is 'ui' unless the HQ server's MCP client sent X-HQ-Via: mcp.
  insert into proposals (kind, target_id, field, old, new, created_by, via)
    values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"sourced"', '"meeting"', me, 'job') returning id into p2;
  assert (select old from proposals where id = p2) = '"qualified"'::jsonb, 'proposals.old is the live value, not the caller''s';
  assert (select via from proposals where id = p2) = 'ui', 'proposals.via is not caller-set';
  perform set_config('request.headers', '{"x-hq-via":"mcp"}', true);
  insert into proposals (kind, target_id, field, new, created_by, via)
    values ('lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"won"', me, 'ui') returning id into p4;
  perform set_config('request.headers', '', true);
  assert (select via from proposals where id = p4) = 'mcp', 'X-HQ-Via: mcp sets via';
  -- compare-and-set: the live value moved after the proposal was filed -> stale, nothing applied
  update businesses set stage = 'attempted' where id = '00000000-0000-0000-0000-00000000b001';
  assert decide_proposal(p2, true) = 'stale', 'mismatch returns stale';
  assert (select stage from businesses where id = '00000000-0000-0000-0000-00000000b001') = 'attempted', 'stale did not apply';
  assert (select status from proposals where id = p2) = 'stale', 'stale recorded';
  update businesses set stage = 'qualified' where id = '00000000-0000-0000-0000-00000000b001';

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
  -- two proposals filed against the same live value: the first approval wins, the second is stale
  insert into proposals (kind, target_id, field, new, created_by)
    values ('finance', '2026-10-19', 'cold_call/spend_cents', '900', me) returning id into f3;
  insert into proposals (kind, target_id, field, new, created_by)
    values ('finance', '2026-10-19', 'cold_call/spend_cents', '700', me) returning id into f4;
  assert (select old from proposals where id = f3) = '500'::jsonb, 'finance proposals.old is the live value';
  assert decide_proposal(f3, true) = 'approved', 'finance first approval';
  assert decide_proposal(f4, true) = 'stale', 'finance stale';
  assert (select spend_cents from finance_inputs where week = '2026-10-19' and channel = 'cold_call') = 900, 'finance stale did not apply';
  begin
    insert into proposals (kind, target_id, field, new, created_by)
      values ('finance', '2026-10-19', 'cold_call/created_at', '1', me);
    raise exception 'finance proposal on non-whitelisted column';
  exception when check_violation then null; end;
end $$;
reset role;

-- ---- 0031: roles, append-only audit, no direct finance writes -----------------------------------
-- staff (a profiles row with role 'staff'): reads fine, cannot decide, cannot write finance_inputs
do $$ begin
  assert (select public.is_admin() from (select 1) s) is not null, 'is_admin exists';
  assert has_function_privilege('authenticated', 'public.is_admin()', 'execute'), 'authenticated cannot execute is_admin';
  assert not has_function_privilege('anon', 'public.is_admin()', 'execute'), 'anon can execute is_admin';
  assert (select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure), 'is_admin is not security definer';
  assert not has_table_privilege('authenticated', 'public.finance_inputs', 'insert'), 'authenticated can INSERT finance_inputs';
  assert not has_table_privilege('authenticated', 'public.finance_inputs', 'update'), 'authenticated can UPDATE finance_inputs';
  assert not has_table_privilege('authenticated', 'public.events', 'update'), 'authenticated can UPDATE events';
  assert not exists (select 1 from pg_policies where tablename = 'events' and cmd = 'UPDATE'), 'events still has an update policy';
  assert not exists (select 1 from pg_policies where tablename = 'finance_inputs' and cmd in ('INSERT', 'UPDATE')
                       and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'is_admin'), 'finance_inputs policy not admin-only';
  assert exists (select 1 from pg_indexes where tablename = 'tasks' and indexname = 'tasks_alert_key_open_idx'
                   and indexdef ~ 'UNIQUE.*alert_key.*status'), 'unique open alert_key index missing';
end $$;

insert into proposals (id, kind, target_id, field, old, new, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', 'lead_stage', '00000000-0000-0000-0000-00000000b001', 'stage', '"qualified"', '"attempted"', '00000000-0000-0000-0000-0000000000a1');
insert into events (job, kind) values ('hq', 'rls-test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert not public.is_admin(), 'staff is_admin';
  assert (select count(*) from proposals) >= 1, 'staff can read proposals';
  begin
    perform decide_proposal('00000000-0000-0000-0000-0000000000c1', true);
    raise exception 'staff decided a proposal';
  exception when insufficient_privilege then null; end;
  begin
    perform decide_proposal('00000000-0000-0000-0000-0000000000c1', false);
    raise exception 'staff rejected a proposal';
  exception when insufficient_privilege then null; end;
  assert (select status from proposals where id = '00000000-0000-0000-0000-0000000000c1') = 'pending', 'staff changed a proposal';
  begin
    insert into finance_inputs (week, channel, spend_cents) values ('2026-10-26', 'cold_call', 1);
    raise exception 'staff inserted finance_inputs';
  exception when insufficient_privilege then null; end;
  begin
    update finance_inputs set spend_cents = 1;
    raise exception 'staff updated finance_inputs';
  exception when insufficient_privilege then null; end;
  begin
    update events set kind = 'tampered';
    raise exception 'staff updated events';
  exception when insufficient_privilege then null; end;
  -- events stay append-only for everyone, insert still works
  insert into events (job, kind) values ('hq', 'rls-test-2');
  -- mcp_tokens is closed to direct access; the functions are the only way in
  begin
    perform count(*) from mcp_tokens;
    raise exception 'authenticated selected mcp_tokens';
  exception when insufficient_privilege then null; end;
  begin
    insert into mcp_tokens (hash, kind, user_id, payload, expires_at)
      values (repeat('a', 64), 'access', auth.uid(), '{}', now() + interval '1 hour');
    raise exception 'authenticated inserted mcp_tokens';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- the same, as the admin: still no direct finance write, and decide_proposal works
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert public.is_admin(), 'admin is_admin';
  begin
    insert into finance_inputs (week, channel, spend_cents) values ('2026-10-26', 'cold_call', 1);
    raise exception 'admin inserted finance_inputs directly';
  exception when insufficient_privilege then null; end;
  assert decide_proposal('00000000-0000-0000-0000-0000000000c1', false) = 'rejected', 'admin decides';
end $$;
reset role;

-- ---- 0031: mcp_tokens ----------------------------------------------------------------------------
do $$ begin
  assert not has_table_privilege('authenticated', 'public.mcp_tokens', 'select'), 'authenticated has SELECT on mcp_tokens';
  assert not has_table_privilege('anon', 'public.mcp_tokens', 'select'), 'anon has SELECT on mcp_tokens';
  assert not has_table_privilege('authenticated', 'public.mcp_tokens', 'insert'), 'authenticated has INSERT on mcp_tokens';
  assert (select relrowsecurity from pg_class where oid = 'public.mcp_tokens'::regclass), 'mcp_tokens has no RLS';
  assert (select bool_and(prosecdef) from pg_proc where proname like 'mcp\_token\_%' and pronamespace = 'public'::regnamespace),
    'an mcp_token_* function is not security definer';
  assert not has_function_privilege('anon', 'public.mcp_token_store(text,text,uuid,jsonb,timestamptz)', 'execute'), 'anon can store tokens';
  assert not has_function_privilege('anon', 'public.mcp_token_revoke_user(uuid)', 'execute'), 'anon can revoke a user';
  assert has_function_privilege('anon', 'public.mcp_token_lookup(text)', 'execute'), 'lookup needs the anon key';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare h1 text := repeat('1', 64); h2 text := repeat('2', 64); h3 text := repeat('3', 64); r jsonb;
begin
  perform mcp_token_store(h1, 'access', auth.uid(), '{"jwt":"j","handle":"nate"}', now() + interval '1 hour');
  perform mcp_token_store(h2, 'refresh', auth.uid(), '{"sbRefresh":"r"}', now() + interval '30 days');
  -- someone else's id, a bad expiry and a bad hash are refused
  begin
    perform mcp_token_store(h3, 'access', '00000000-0000-0000-0000-0000000000a3', '{}', now() + interval '1 hour');
    raise exception 'stored a token for another user';
  exception when insufficient_privilege then null; end;
  begin
    perform mcp_token_store(h3, 'access', auth.uid(), '{}', now() - interval '1 second');
    raise exception 'stored an already-expired token';
  exception when raise_exception then
    if sqlerrm <> 'bad expiry' then raise; end if;
  end;
  -- the same hash again re-points the row (GoTrue rotated the refresh token it holds)
  perform mcp_token_store(h2, 'refresh', auth.uid(), '{"sbRefresh":"r2"}', now() + interval '30 days');
  begin
    perform mcp_token_store('not-a-hash', 'access', auth.uid(), '{}', now() + interval '1 hour');
    raise exception 'stored a malformed hash';
  exception when check_violation then null; end;
end $$;
reset role;

-- lookup with the anon key: a hit returns the payload, a miss or an expired row returns null
set local role anon;
do $$ begin
  assert (mcp_token_lookup(repeat('1', 64))->>'kind') = 'access' and (mcp_token_lookup(repeat('1', 64))->'payload'->>'handle') = 'nate', 'lookup hit';
  assert (mcp_token_lookup(repeat('1', 64))->>'user_id') = '00000000-0000-0000-0000-0000000000a1', 'lookup user_id';
  assert mcp_token_lookup(repeat('9', 64)) is null, 'lookup miss';
  assert (mcp_token_lookup(repeat('2', 64))->'payload'->>'sbRefresh') = 'r2', 'store on an existing hash re-points the row';
end $$;
reset role;
update mcp_tokens set expires_at = now() - interval '1 second' where hash = repeat('1', 64);
set local role anon;
do $$ begin
  assert mcp_token_lookup(repeat('1', 64)) is null, 'expired row refused';
  perform mcp_token_revoke(repeat('2', 64));
end $$;
reset role;
do $$ begin
  assert (select count(*) from mcp_tokens where hash = repeat('2', 64)) = 0, 'revoke by hash';
end $$;

-- revoke_user: only your own rows, everything of yours
insert into mcp_tokens (hash, kind, user_id, payload, expires_at) values
  (repeat('a', 64), 'access', '00000000-0000-0000-0000-0000000000a1', '{}', now() + interval '1 hour'),
  (repeat('b', 64), 'refresh', '00000000-0000-0000-0000-0000000000a1', '{}', now() + interval '1 day'),
  (repeat('c', 64), 'access', '00000000-0000-0000-0000-0000000000a3', '{}', now() + interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  begin
    perform mcp_token_revoke_user('00000000-0000-0000-0000-0000000000a3');
    raise exception 'revoked another user''s tokens';
  exception when insufficient_privilege then null; end;
  perform mcp_token_revoke_user(auth.uid());
end $$;
reset role;
do $$ begin
  assert (select count(*) from mcp_tokens where user_id = '00000000-0000-0000-0000-0000000000a1') = 0, 'revoke_user cleared the user';
  assert (select count(*) from mcp_tokens where user_id = '00000000-0000-0000-0000-0000000000a3') = 1, 'revoke_user touched another user';
end $$;

-- ---- 0031 QA: store cap, hash hijack, bounds, anon direct access ------------------------------------
set local role anon;
do $$ begin
  begin
    perform count(*) from mcp_tokens;
    raise exception 'anon selected mcp_tokens';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- user a3 holds one token (hash c...). a1 stores 105 rows: the cap keeps a1's newest 100, never touches a3's
insert into mcp_tokens (hash, kind, user_id, payload, expires_at, created_at)
  select lpad(to_hex(i), 64, '0'), 'access', '00000000-0000-0000-0000-0000000000a1', '{}', now() + interval '1 hour',
         now() - make_interval(secs => 1000 - i)
    from generate_series(1, 105) i;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  perform mcp_token_store(repeat('d', 64), 'access', auth.uid(), '{}', now() + interval '1 hour');
end $$;
reset role;
do $$ begin
  assert (select count(*) from mcp_tokens where user_id = '00000000-0000-0000-0000-0000000000a1') = 100, 'per-user cap is 100: ' || (select count(*) from mcp_tokens where user_id = '00000000-0000-0000-0000-0000000000a1');
  assert exists (select 1 from mcp_tokens where hash = repeat('d', 64)), 'newest row survives the cap';
  assert not exists (select 1 from mcp_tokens where hash = lpad(to_hex(1), 64, '0')), 'oldest row is evicted by the cap';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  -- a1 may not take over a3's row by storing its hash
  perform mcp_token_store(repeat('c', 64), 'access', auth.uid(), '{"jwt":"stolen"}', now() + interval '1 hour');
  begin
    perform mcp_token_store(repeat('e', 64), 'access', auth.uid(), '{}', now() + interval '91 days');
    raise exception 'stored a 91-day token';
  exception when raise_exception then if sqlerrm <> 'bad expiry' then raise; end if; end;
  begin
    perform mcp_token_store(repeat('e', 64), 'access', auth.uid(), jsonb_build_object('x', repeat('x', 9000)), now() + interval '1 hour');
    raise exception 'stored an oversize payload';
  exception when raise_exception then if sqlerrm <> 'payload too large' then raise; end if; end;
  begin
    perform mcp_token_store(repeat('e', 64), 'bogus', auth.uid(), '{}', now() + interval '1 hour');
    raise exception 'stored a bad kind';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  assert (select user_id from mcp_tokens where hash = repeat('c', 64)) = '00000000-0000-0000-0000-0000000000a3', 'a1 hijacked a3 hash';
  assert (select payload from mcp_tokens where hash = repeat('c', 64)) = '{}'::jsonb, 'a1 overwrote a3 payload';
end $$;

rollback;
\echo rls.sql: PASS
