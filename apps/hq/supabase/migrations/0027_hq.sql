-- ---------------------------------------------------------------------------
-- 0027_hq — HQ: the internal command center on top of the pipeline schema.
--
-- Additive only: 0001-0026 are the bcns-internal pipeline schema, byte-for-byte,
-- already applied on the live project. This file must also apply there, where
-- `businesses` has ~7k rows whose `research` is double-encoded jsonb (a jsonb
-- string that itself contains JSON).
--
-- Posture change: 0018/0020 were deny-all (RLS on, no policies; jobs use the
-- service role). HQ adds signed-in humans: policies for `authenticated` gated by
-- is_hq() (a row in `profiles`). `anon` loses every grant. Nothing is deletable
-- through the API (no delete policy anywhere). `mailboxes`, `email_threads`,
-- `alerts`, `search_grid` keep no policies: unreadable through the API.
-- ---------------------------------------------------------------------------

begin;

-- ---- who counts as HQ ------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  handle       text unique check (handle in ('nate', 'brandon')),
  role         text check (role in ('admin', 'staff')),
  created_at   timestamptz default now()
);

create function public.is_hq() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid()) $$;

revoke execute on function public.is_hq() from public, anon;
grant execute on function public.is_hq() to authenticated;

-- ---- lock-down -------------------------------------------------------------
-- selectable_businesses was postgres-owned (runs as owner, bypasses RLS) with
-- anon SELECT. Recreate as security_invoker so the caller's RLS applies. Done
-- BEFORE the businesses ALTERs below so `select *` expands to the same column
-- list as today (0023's), not the new HQ columns.
create or replace view public.selectable_businesses with (security_invoker = true) as
  select * from businesses where suppressed_at is null;

-- ---- businesses ------------------------------------------------------------
alter table businesses drop constraint businesses_stage_check;
alter table businesses add constraint businesses_stage_check check (stage in (
  'sourced', 'qualified', 'call_due', 'drafted', 'approved', 'sent', 'replied',
  'quoting', 'meeting', 'quoted', 'won', 'onboarded', 'lost', 'no_email',
  -- HQ calling funnel
  'attempted', 'reached', 'consult_scheduled', 'consult_done', 'dead'
));

alter table businesses
  add column assigned_to      text not null default 'brandon' check (assigned_to in ('nate', 'brandon')),
  add column waiting_on       text,
  add column next_contact_at  timestamptz,
  add column consult_at       timestamptz,
  add column deal_value_cents integer;

-- fit_score lives inside `research`, which is a real object on new writes but a
-- jsonb STRING containing JSON on every row written so far. Never raises:
-- non-JSON string, non-numeric or out-of-range fit_score -> null. A generated
-- column needs an immutable expression; plpgsql with an exception handler is.
create function public.hq_fit_score(r jsonb) returns numeric
language plpgsql immutable set search_path = ''
as $$
declare n numeric;
begin
  n := (case jsonb_typeof(r) when 'string' then (r #>> '{}')::jsonb else r end ->> 'fit_score')::numeric;
  if n::text in ('NaN', 'Infinity', '-Infinity') then return null; end if;
  return n;
exception when others then
  return null;
end $$;

alter table businesses
  add column fit_score numeric generated always as (public.hq_fit_score(research)) stored;

create index businesses_stage_fit_idx on businesses (stage, fit_score desc);

-- 0018: "nothing in this schema can clear suppressed_at". HQ now has an UPDATE
-- policy on businesses, so keep that promise for signed-in users: once set, it
-- cannot be cleared or changed. (Jobs/service role are unaffected.)
create function public.businesses_keep_suppressed() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.suppressed_at is not null and new.suppressed_at is distinct from old.suppressed_at
     and current_user in ('authenticated', 'anon') then
    raise exception 'suppressed_at cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger businesses_keep_suppressed before update on businesses
  for each row execute function public.businesses_keep_suppressed();

-- ---- clients ---------------------------------------------------------------
alter table clients
  add column kind         text,
  add column stage        text,
  add column health       text check (health in ('green', 'amber', 'red')),
  add column owner        text,
  add column channel      text,
  add column billing_note text;

-- ---- events ----------------------------------------------------------------
-- Job runs are events rows with kind = 'run', detail {ok, ms, error}.
-- events_job_created_at_idx (job, created_at desc) already exists from 0018.
alter table events
  add column actor uuid,
  add column via   text check (via in ('ui', 'mcp', 'job'));

-- ---- new tables ------------------------------------------------------------
create table calls (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses (id),
  by          text,
  at          timestamptz default now(),
  outcome     text check (outcome in ('reached', 'no_answer', 'consult_booked', 'not_interested', 'imported')),
  note        text,
  actor       uuid,
  via         text,
  created_at  timestamptz default now()
);
create index calls_business_idx on calls (business_id);

create table tasks (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  body        text,
  owner       text check (owner in ('nate', 'brandon', 'claude')),
  area        text,
  status      text default 'todo' check (status in ('todo', 'doing', 'waiting', 'done')),
  due         date,
  source      text default 'manual' check (source in ('manual', 'tracker', 'lead', 'alert')),
  business_id uuid references businesses (id),
  client_slug text,
  alert_key   text,
  waiting_on  text,
  created_by  uuid,
  via         text,
  done_at     timestamptz,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);
create index tasks_owner_status_idx on tasks (owner, status);

create table notes (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses (id),
  client_slug text,
  task_id     uuid references tasks (id),
  body        text not null,
  actor       uuid,
  via         text,
  created_at  timestamptz default now(),
  check (num_nonnulls(business_id, client_slug, task_id) = 1)
);

create table links (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses (id),
  client_slug text,
  task_id     uuid references tasks (id),
  label       text,
  url         text check (url ~ '^https://'),
  actor       uuid,
  via         text,
  created_at  timestamptz default now(),
  check (num_nonnulls(business_id, client_slug, task_id) = 1)
);

create table list_items (
  id         uuid default gen_random_uuid() primary key,
  list       text check (list in ('warm', 'interviews', 'associations')),
  business   text,
  who        text,
  status     text check (status in ('todo', 'reached', 'scheduled', 'done', 'no')),
  notes      text,
  sort       integer,
  created_at timestamptz default now()
);

-- Claude (and anyone) proposes; only decide_proposal() changes a proposal.
--   lead_stage: target_id = businesses.id (uuid text), field = 'stage', old/new = jsonb string.
--   finance:    target_id = week start date 'YYYY-MM-DD', field = '<channel>/<column>' with
--               column in spend_cents|hours|leads|pilots|signed, old/new = jsonb number
--               (old null = no value yet).
create table proposals (
  id         uuid default gen_random_uuid() primary key,
  kind       text check (kind in ('lead_stage', 'finance')),
  target_id  text not null,
  field      text not null,
  old        jsonb,
  new        jsonb,
  reason     text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'stale')),
  created_by uuid,
  via        text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz default now(),
  -- whitelist: a lead_stage proposal may only set the stage (no free-form columns)
  check (kind is distinct from 'lead_stage' or field = 'stage'),
  check (kind is distinct from 'finance' or field ~ '^[^/]+/(spend_cents|hours|leads|pilots|signed)$')
);
create index proposals_status_idx on proposals (status, created_at);

create table finance_inputs (
  week        date,
  channel     text,
  spend_cents integer default 0,
  hours       numeric default 0,
  leads       integer,
  pilots      integer,
  signed      integer,
  created_at  timestamptz default now(),
  primary key (week, channel)
);

create table finance_snapshots (
  month      date primary key,
  data       jsonb not null,
  created_at timestamptz default now()
);

-- Per caller, per Monday-start week (America/New_York): calls, people reached
-- (reached or consult booked), consults booked.
create view call_weeks with (security_invoker = true) as
  select "by",
         date_trunc('week', "at" at time zone 'America/New_York')::date as week,
         count(*)                                                     as calls,
         count(*) filter (where outcome in ('reached', 'consult_booked')) as reached,
         count(*) filter (where outcome = 'consult_booked')           as consults
  from calls
  group by 1, 2;

-- ---- RLS -------------------------------------------------------------------
alter table profiles          enable row level security;
alter table calls             enable row level security;
alter table tasks             enable row level security;
alter table notes             enable row level security;
alter table links             enable row level security;
alter table list_items        enable row level security;
alter table proposals         enable row level security;
alter table finance_inputs    enable row level security;
alter table finance_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['businesses', 'clients', 'calls', 'tasks', 'notes', 'links',
                           'list_items', 'finance_inputs', 'finance_snapshots', 'events'] loop
    execute format('create policy hq_select on %I for select to authenticated using (public.is_hq())', t);
    execute format('create policy hq_insert on %I for insert to authenticated with check (public.is_hq())', t);
    execute format('create policy hq_update on %I for update to authenticated using (public.is_hq()) with check (public.is_hq())', t);
  end loop;
end $$;

create policy hq_select on profiles  for select to authenticated using (public.is_hq());
create policy hq_select on proposals for select to authenticated using (public.is_hq());
create policy hq_insert on proposals for insert to authenticated
  with check (public.is_hq() and status = 'pending' and created_by = auth.uid());
-- no update/delete policy on proposals; also no UPDATE/DELETE privilege, so an
-- attempt errors instead of silently matching zero rows.
revoke update, delete on proposals from authenticated;

-- ---- decide_proposal -------------------------------------------------------
-- Compare-and-set: the proposal's `old` must still equal the live value, else
-- it is marked stale and nothing is applied. Reject never touches the data.
create function public.decide_proposal(p_id uuid, p_approve boolean) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  p      proposals;
  cur    jsonb;
  v      text;
  wk     date;
  ch     text;
  col    text;
  result text;
begin
  if not public.is_hq() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into p from proposals where id = p_id and status = 'pending' for update;
  if not found then
    raise exception 'proposal % is not pending', p_id;
  end if;

  if not p_approve then
    result := 'rejected';
  else
    v := p.new #>> '{}';
    if v is null then raise exception 'proposal has no new value'; end if;
    if p.kind = 'lead_stage' then
      if p.field <> 'stage' then raise exception 'unsupported field %', p.field; end if;
      select to_jsonb(stage) into cur from businesses where id = p.target_id::uuid;
      if not found or cur is distinct from p.old then
        result := 'stale';
      else
        update businesses set stage = v, updated_at = now() where id = p.target_id::uuid;
        result := 'approved';
      end if;
    else
      wk  := p.target_id::date;
      ch  := split_part(p.field, '/', 1);
      col := split_part(p.field, '/', 2);
      select case col when 'spend_cents' then to_jsonb(spend_cents) when 'hours' then to_jsonb(hours)
                      when 'leads' then to_jsonb(leads) when 'pilots' then to_jsonb(pilots)
                      when 'signed' then to_jsonb(signed) end
        into cur from finance_inputs where week = wk and channel = ch;
      if coalesce(cur, 'null'::jsonb) is distinct from coalesce(p.old, 'null'::jsonb) then
        result := 'stale';
      else
        insert into finance_inputs (week, channel, spend_cents, hours, leads, pilots, signed)
        values (wk, ch,
                coalesce(case col when 'spend_cents' then round(v::numeric)::integer end, 0),
                coalesce(case col when 'hours' then v::numeric end, 0),
                case col when 'leads'  then round(v::numeric)::integer end,
                case col when 'pilots' then round(v::numeric)::integer end,
                case col when 'signed' then round(v::numeric)::integer end)
        on conflict (week, channel) do update set
          spend_cents = case col when 'spend_cents' then excluded.spend_cents else finance_inputs.spend_cents end,
          hours       = case col when 'hours'       then excluded.hours       else finance_inputs.hours       end,
          leads       = case col when 'leads'       then excluded.leads       else finance_inputs.leads       end,
          pilots      = case col when 'pilots'      then excluded.pilots      else finance_inputs.pilots      end,
          signed      = case col when 'signed'      then excluded.signed      else finance_inputs.signed      end;
        result := 'approved';
      end if;
    end if;
  end if;

  update proposals set status = result, decided_by = auth.uid(), decided_at = now() where id = p_id;
  return result;
end $$;

revoke execute on function public.decide_proposal(uuid, boolean) from public, anon;
grant execute on function public.decide_proposal(uuid, boolean) to authenticated;

-- ---- grants ----------------------------------------------------------------
-- Newer Supabase projects no longer auto-grant table access to API roles, older
-- ones did; state it explicitly so both end up the same. RLS above is the filter.
grant select, insert, update on businesses, clients, calls, tasks, notes, links,
  list_items, finance_inputs, finance_snapshots, events to authenticated;
grant select on profiles, selectable_businesses, call_weeks to authenticated;
grant select, insert on proposals to authenticated;
grant usage, select on sequence events_id_seq to authenticated;

-- ---- anon gets nothing; authenticated cannot delete or TRUNCATE (bypasses RLS) ----
-- Last, so it covers every table, view and sequence created above.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger, delete on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

commit;
