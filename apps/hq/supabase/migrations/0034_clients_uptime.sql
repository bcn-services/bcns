-- ---------------------------------------------------------------------------
-- 0034_clients_uptime — uptime checks, derived client health, and the `client` proposal kind.
--
--   * uptime_checks: one row per target per 5-minute check, written by jobs/uptime.mjs (the pooler's
--     postgres role, which bypasses RLS and needs no grant) and pruned to 7 days by the same job.
--     HQ staff read it through is_hq(); nobody else gets any access, and no API role can write it.
--   * uptime_status: latest check per target + the last OK time, for the Clients health dot.
--     clients.health (0027) stays in the table but nothing writes it any more: the Clients page
--     derives it from this view, the platform's ops.connector_health and Mercury.
--   * proposals.kind gains 'client': target_id = clients.slug, field = one of the Clients Edit
--     whitelist (lib/clients/fields.ts), old/new = jsonb. The shape check below keeps a bad value
--     from ever being filed; decide_proposal applies it (admin only, compare-and-set on old).
--   * clients: editing and inserting are admin acts (were is_hq(): any profiles row). The Edit form
--     action also checks is_admin(); this is the second wall.
-- Deploy safety: new table/view/function arms only; the kind check is loosened, the clients update
-- policies are tightened (the live release's Edit form for non-admins stops working, by design).
-- ---------------------------------------------------------------------------

begin;

-- ---- uptime_checks -----------------------------------------------------------------------
create table uptime_checks (
  target     text        not null check (target ~ '^[a-z0-9-]{1,40}$'),
  ok         boolean     not null,
  status     integer,                       -- HTTP status; null when the request itself failed
  latency_ms integer,
  checked_at timestamptz not null default now(),
  primary key (target, checked_at)
);
create index uptime_checks_checked_at_idx on uptime_checks (checked_at);  -- the 7-day prune

alter table uptime_checks enable row level security;
create policy hq_select on uptime_checks for select to authenticated using (public.is_hq());
revoke all on uptime_checks from public, anon, authenticated;
grant select on uptime_checks to authenticated;

create view uptime_status with (security_invoker = true) as
  select distinct on (c.target)
         c.target, c.ok, c.status, c.latency_ms, c.checked_at,
         (select max(o.checked_at) from uptime_checks o where o.target = c.target and o.ok) as last_ok_at
    from uptime_checks c
   order by c.target, c.checked_at desc;
revoke all on uptime_status from public, anon, authenticated;
grant select on uptime_status to authenticated;

-- ---- proposals: kind 'client' --------------------------------------------------------------
alter table proposals drop constraint proposals_kind_check;
alter table proposals add constraint proposals_kind_check
  check (kind in ('lead_stage', 'finance', 'client'));

-- Whitelist + value shape, enforced where the row is written (mirrors lib/clients/fields.ts).
alter table proposals add constraint proposals_client_shape check (
  kind is distinct from 'client' or (
    new is not null and case field
      when 'monthly_rate_cents' then jsonb_typeof(new) = 'number' and (new #>> '{}') ~ '^[0-9]{1,10}$'
      when 'billing_source'     then new in ('"mercury"'::jsonb, '"stripe"'::jsonb, '"none"'::jsonb)
      when 'mercury_customer_id' then jsonb_typeof(new) = 'string' and (new #>> '{}') ~ '^[A-Za-z0-9_-]{1,100}$'
      -- every element a string of 1-100 chars (like checkField); `.type()` first so a number or object is caught
      when 'aliases'            then jsonb_typeof(new) = 'array' and jsonb_array_length(new) <= 20
                                     and not jsonb_path_exists(new, '$[*] ? (@.type() != "string" || !(@ like_regex "^.{1,100}$"))')
      when 'repo_url'           then jsonb_typeof(new) = 'string' and (new #>> '{}') ~ '^https://[^[:space:]]+$' and length(new #>> '{}') <= 300
      -- `@?` swallows the parse error and returns NULL, which a CHECK passes: coalesce to false so "2026-02-31" is refused
      when 'launch_date'        then jsonb_typeof(new) = 'string' and (new #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                                     and coalesce(new @? '$.datetime("yyyy-mm-dd")', false)
      when 'notes'              then jsonb_typeof(new) = 'string' and length(new #>> '{}') <= 2000
      else false
    end
  )
);

-- old / via stay server-set (0031); the client arm reads the live column.
create or replace function public.proposals_server_fields() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare
  hdr text;
  col text := split_part(new.field, '/', 2);
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  hdr := nullif(current_setting('request.headers', true), '')::json ->> 'x-hq-via';
  new.via := case when hdr = 'mcp' then 'mcp' else 'ui' end;
  if new.kind = 'lead_stage' then
    select to_jsonb(stage) into new.old from businesses where id = new.target_id::uuid;
  elsif new.kind = 'client' then
    select case new.field
             when 'monthly_rate_cents' then to_jsonb(monthly_rate_cents)
             when 'billing_source' then to_jsonb(billing_source)
             when 'mercury_customer_id' then to_jsonb(mercury_customer_id)
             when 'aliases' then to_jsonb(aliases)
             when 'repo_url' then to_jsonb(repo_url)
             when 'launch_date' then to_jsonb(launch_date)
             when 'notes' then to_jsonb(notes)
           end
      into new.old from clients where slug = new.target_id;
  else
    select case col when 'spend_cents' then to_jsonb(spend_cents) when 'hours' then to_jsonb(hours)
                    when 'leads' then to_jsonb(leads) when 'pilots' then to_jsonb(pilots)
                    when 'signed' then to_jsonb(signed) end
      into new.old from finance_inputs
     where week = new.target_id::date and channel = split_part(new.field, '/', 1);
  end if;
  return new;
end $$;

-- ---- decide_proposal: + kind 'client' (everything else is 0031 verbatim) -----------------------
create or replace function public.decide_proposal(p_id uuid, p_approve boolean) returns text
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
  if not public.is_admin() then
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
      select to_jsonb(stage) into cur from businesses where id = p.target_id::uuid for update;
      if not found or cur is distinct from p.old then
        result := 'stale';
      else
        update businesses set stage = v, updated_at = now() where id = p.target_id::uuid;
        result := 'approved';
      end if;
    elsif p.kind = 'finance' then
      wk  := p.target_id::date;
      ch  := split_part(p.field, '/', 1);
      col := split_part(p.field, '/', 2);
      -- the row may not exist yet, so FOR UPDATE can't serialize first writes: lock the key
      perform pg_advisory_xact_lock(hashtext('finance_inputs:' || wk || ':' || ch));
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
    elsif p.kind = 'client' then
      -- the shape check on proposals already limited field and value; unknown field = error, not a write
      if p.field not in ('monthly_rate_cents', 'billing_source', 'mercury_customer_id', 'aliases',
                         'repo_url', 'launch_date', 'notes') then
        raise exception 'unsupported field %', p.field;
      end if;
      select case p.field
               when 'monthly_rate_cents' then to_jsonb(monthly_rate_cents)
               when 'billing_source' then to_jsonb(billing_source)
               when 'mercury_customer_id' then to_jsonb(mercury_customer_id)
               when 'aliases' then to_jsonb(aliases)
               when 'repo_url' then to_jsonb(repo_url)
               when 'launch_date' then to_jsonb(launch_date)
               when 'notes' then to_jsonb(notes)
             end
        into cur from clients where slug = p.target_id for update;
      if not found or coalesce(cur, 'null'::jsonb) is distinct from coalesce(p.old, 'null'::jsonb) then
        result := 'stale';
      else
        update clients set
          monthly_rate_cents  = case when p.field = 'monthly_rate_cents'  then v::bigint else monthly_rate_cents end,
          billing_source      = case when p.field = 'billing_source'      then v else billing_source end,
          mercury_customer_id = case when p.field = 'mercury_customer_id' then v else mercury_customer_id end,
          aliases             = case when p.field = 'aliases' then array(select jsonb_array_elements_text(p.new)) else aliases end,
          repo_url            = case when p.field = 'repo_url'            then v else repo_url end,
          launch_date         = case when p.field = 'launch_date'         then v::date else launch_date end,
          notes               = case when p.field = 'notes'               then v else notes end,
          updated_at          = now()
        where slug = p.target_id;
        result := 'approved';
      end if;
    else
      raise exception 'unknown kind %', p.kind;
    end if;
  end if;

  update proposals set status = result, decided_by = auth.uid(), decided_at = now() where id = p_id;
  return result;
end $$;

revoke execute on function public.decide_proposal(uuid, boolean) from public, anon;
grant execute on function public.decide_proposal(uuid, boolean) to authenticated;

-- ---- clients: editing is an admin act ---------------------------------------------------------
drop policy hq_update on clients;
create policy hq_update on clients for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- insert too: a staff PostgREST insert could otherwise seed a client with a rate and aliases that feed MRR
drop policy hq_insert on clients;
create policy hq_insert on clients for insert to authenticated with check (public.is_admin());

commit;
