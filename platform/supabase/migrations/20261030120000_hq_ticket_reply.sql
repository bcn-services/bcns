-- HQ ticket reply (apps/hq job `tickets`): answers a ticket without closing it. The text lands in
-- data.tickets.resolution (shown to members as "Reply from bcns" via api.tickets_v1) and the status
-- becomes 'answered'. A later hq_ticket_resolve overwrites resolution with the closing text.
-- Returns rows updated: 0 for an unknown id or a closed ticket.
create or replace function ops.hq_ticket_reply(p_id uuid, p_text text)
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update data.tickets
     set resolution = nullif(p_text, ''), status = 'answered'
   where id = p_id and status <> 'closed';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function ops.hq_ticket_reply(uuid, text) from public, anon, authenticated, service_role;
grant execute on function ops.hq_ticket_reply(uuid, text) to hq_tickets;
