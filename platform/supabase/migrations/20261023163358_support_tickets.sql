-- Hub support tickets (apps/connect /support). A member writes to bcns from the hub; the row is
-- the record (history visible to the whole workspace), the Resend mail to Nate is the delivery.
-- Status flips are Nate's, by SQL: update data.tickets set status = 'answered' where id = '<id>'.
--
-- data.tickets: RLS enabled and FORCED, SELECT by tenant (same policy text as every other data
-- table), no insert/update/delete grant. The only write path is api.ticket_create below.

create table data.tickets (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references data.clients(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  subject    text not null check (char_length(subject) between 1 and 120),
  body       text not null check (char_length(body) between 1 and 4000),
  severity   text not null default 'normal' check (severity in ('low', 'normal', 'urgent')),
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on data.tickets (client_id, created_at desc);
create trigger touch before update on data.tickets for each row execute function data.touch_updated_at();

alter table data.tickets enable row level security;
alter table data.tickets force row level security;
revoke all on data.tickets from public, anon, authenticated, service_role;
grant select on data.tickets to authenticated;
create policy tenant on data.tickets for select to authenticated using (client_id = (select data.active_client_id()));

-- security_invoker: the caller's RLS applies, so a member sees only their workspace's tickets.
-- created_by stays out of the view; `source` and `updated_at` are the common api columns.
create view api.tickets_v1 with (security_invoker = true) as
  select client_id, 'platform'::data.source as source, id, subject, body, severity, status, created_at, updated_at
  from data.tickets;
grant select on api.tickets_v1 to authenticated;

-- Any member of the caller's active workspace. The tenant is data.tenant_or_raise() (BCNS0 with
-- no active membership) and is never an argument. At most 10 tickets per workspace per hour, so a
-- stuck client cannot turn the support mailbox into a flood.
-- Errors: BCNS0 no_tenant · BCNS3 validation (detail names the field) · BCNS9 rate_limited.
create function api.ticket_create(p_subject text, p_body text, p_severity text default 'normal')
returns table (id uuid, client_slug text)
language plpgsql security definer set search_path = '' as $$
declare
  tenant uuid := data.tenant_or_raise();
  subj text := btrim(coalesce(p_subject, ''));
  txt  text := btrim(coalesce(p_body, ''));
  new_id uuid;
begin
  if subj = '' or char_length(subj) > 120 or subj ~ '[[:cntrl:]]' then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'subject';
  end if;
  if txt = '' or char_length(txt) > 4000 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'body';
  end if;
  if p_severity is null or p_severity not in ('low', 'normal', 'urgent') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'severity';
  end if;
  if (select count(*) from data.tickets t where t.client_id = tenant and t.created_at > now() - interval '1 hour') >= 10 then
    raise exception using errcode = 'BCNS9', message = 'rate_limited';
  end if;
  insert into data.tickets (client_id, created_by, subject, body, severity)
  values (tenant, auth.uid(), subj, txt, p_severity)
  returning data.tickets.id into new_id;
  return query select new_id, c.slug from data.clients c where c.id = tenant;
end $$;

revoke all on function api.ticket_create(text, text, text) from public, anon, service_role;
grant execute on function api.ticket_create(text, text, text) to authenticated;
