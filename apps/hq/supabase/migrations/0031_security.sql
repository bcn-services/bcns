-- ---------------------------------------------------------------------------
-- 0031_security — HQ security review fixes (H1/H2, L1) + MCP OAuth token persistence.
--
--   * is_admin(): profiles.role = 'admin'. decide_proposal() now needs it (0027 stored the
--     role and never enforced it, so any profiles row could approve).
--   * finance_inputs: no direct writes from `authenticated`; only decide_proposal() (security
--     definer) writes it. events: no UPDATE, so the audit trail is append-only.
--   * proposals.old / proposals.via are set by a trigger from the live value and the request,
--     never trusted from the caller.
--   * one open ops task per alert_key (the check-then-insert in createOpsTask raced).
--   * mcp_tokens: HQ's OAuth access/refresh tokens, keyed by HMAC-SHA256(MCP_TOKEN_KEY, token), reachable
--     ONLY through the security-definer mcp_token_* functions (HQ holds no service-role key). Auth codes (60 s)
--     stay in process memory.
-- Nate-run precondition: profiles.role must be 'admin' for whoever approves (Nate), or nobody can.
-- ---------------------------------------------------------------------------

begin;

-- ---- roles -----------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---- decide_proposal: admin only ---------------------------------------------------------
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
  -- 0031: deciding is an admin act (was is_hq(): any profiles row, so staff could approve).
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
    else
      raise exception 'unknown kind %', p.kind;
    end if;
  end if;

  update proposals set status = result, decided_by = auth.uid(), decided_at = now() where id = p_id;
  return result;
end $$;

revoke execute on function public.decide_proposal(uuid, boolean) from public, anon;
grant execute on function public.decide_proposal(uuid, boolean) to authenticated;

-- ---- finance_inputs: admin-only, and only through decide_proposal ---------------------
revoke insert, update on finance_inputs from authenticated;
drop policy hq_insert on finance_inputs;
drop policy hq_update on finance_inputs;
create policy hq_insert on finance_inputs for insert to authenticated with check (public.is_admin());
create policy hq_update on finance_inputs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- events: append-only -----------------------------------------------------------
revoke update on events from authenticated;
drop policy hq_update on events;

-- ---- proposals: old / via are server-set -------------------------------------------
-- old = the live value at insert time (so the diff a human approves is true and decide_proposal's
-- compare-and-set is against what the server saw). via = 'mcp' only when the HQ server's MCP client
-- sent X-HQ-Via: mcp, else 'ui'. Applies to API roles; postgres/service inserts keep what they send.
create function public.proposals_server_fields() returns trigger
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
  else
    select case col when 'spend_cents' then to_jsonb(spend_cents) when 'hours' then to_jsonb(hours)
                    when 'leads' then to_jsonb(leads) when 'pilots' then to_jsonb(pilots)
                    when 'signed' then to_jsonb(signed) end
      into new.old from finance_inputs
     where week = new.target_id::date and channel = split_part(new.field, '/', 1);
  end if;
  return new;
end $$;

create trigger proposals_server_fields before insert on proposals
  for each row execute function public.proposals_server_fields();

-- ---- one open task per alert -------------------------------------------------------
create unique index tasks_alert_key_open_idx on tasks (alert_key) where status <> 'done';

-- ---- MCP OAuth tokens ---------------------------------------------------------------
create table mcp_tokens (
  hash       text primary key check (hash ~ '^[0-9a-f]{64}$'),  -- hex HMAC-SHA256 of the opaque token, keyed by the server-only MCP_TOKEN_KEY
  kind       text not null check (kind in ('access', 'refresh')),
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index mcp_tokens_user_idx on mcp_tokens (user_id, created_at desc);
create index mcp_tokens_expires_idx on mcp_tokens (expires_at);
alter table mcp_tokens enable row level security;  -- and no policy: closed even if a grant returns
revoke all on mcp_tokens from public, anon, authenticated;

-- Called with the signed-in user's own Supabase JWT (the one the token maps to).
create function public.mcp_token_store(
  p_hash text, p_kind text, p_user_id uuid, p_payload jsonb, p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_hq() or p_user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'bad expiry';
  end if;
  if length(p_payload::text) > 8192 then raise exception 'payload too large'; end if;
  delete from mcp_tokens where expires_at < now();
  -- bounded: this user's newest 100 rows (50 pairs) survive
  delete from mcp_tokens where user_id = p_user_id and hash in (
    select hash from mcp_tokens where user_id = p_user_id order by created_at desc offset 99);
  insert into mcp_tokens (hash, kind, user_id, payload, expires_at)
    values (p_hash, p_kind, p_user_id, p_payload, p_expires_at)
    -- same hash again = a refresh row re-pointed at GoTrue's rotated token; never another user's row
    on conflict (hash) do update set payload = excluded.payload, expires_at = excluded.expires_at
      where mcp_tokens.user_id = excluded.user_id;
end $$;

-- Called with the anon key: the only credential the caller has is the token itself. A hit needs the
-- HMAC (server-only key) of a 256-bit random token: a bearer holder cannot compute its own row key, so
-- this anon-callable lookup cannot be used to read the session behind a token. An expired row is a miss.
create function public.mcp_token_lookup(p_hash text) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object('kind', kind, 'user_id', user_id, 'payload', payload, 'expires_at', expires_at)
    from mcp_tokens where hash = p_hash and expires_at > now()
$$;

-- One pair member (token rotation). Anon-callable for the same reason as lookup: it takes the hash.
create function public.mcp_token_revoke(p_hash text) returns void
language sql security definer set search_path = public, pg_temp
as $$ delete from mcp_tokens where hash = p_hash $$;

-- HQ sign-out: every MCP token the signed-in user holds.
create function public.mcp_token_revoke_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from mcp_tokens where user_id = p_user_id;
end $$;

revoke execute on function public.mcp_token_store(text, text, uuid, jsonb, timestamptz) from public, anon;
revoke execute on function public.mcp_token_lookup(text) from public;
revoke execute on function public.mcp_token_revoke(text) from public;
revoke execute on function public.mcp_token_revoke_user(uuid) from public, anon;
grant execute on function public.mcp_token_store(text, text, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.mcp_token_lookup(text) to anon, authenticated;
grant execute on function public.mcp_token_revoke(text) to anon, authenticated;
grant execute on function public.mcp_token_revoke_user(uuid) to authenticated;

commit;
