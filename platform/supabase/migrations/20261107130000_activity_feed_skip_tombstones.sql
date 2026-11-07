-- Recent Activity showed "Task completed" / "Campaign updated" for rows the worker tombstoned
-- (deleted/archived upstream, deleted_at set). Same view, same columns; the jobs and campaign
-- branches now skip deleted rows, matching jobs_v1 and the other branches.
create or replace view api.activity_v1 with (security_invoker = true) as
select client_id, source, kind, occurred_at,
  case kind when 'order' then 'New Shopify order #'||coalesce(order_number, external_id)
            when 'payout' then 'Payout received'
            else 'Refund on #'||coalesce(order_number, external_id) end as title,
  (amount_minor::text||' '||currency) as detail, url, id as ref_id, updated_at from data.money
union all
select client_id, source, 'task_done', source_updated_at, 'Task completed: '||title, status, url, id, updated_at
  from data.jobs where is_done and source_updated_at is not null and deleted_at is null
union all
select client_id, source, 'campaign', source_updated_at, 'Campaign '||coalesce(title, external_id)||' updated', attributes->>'effective_status', null, id, updated_at
  from data.records where kind='campaign' and source_updated_at is not null and deleted_at is null
union all
select client_id, source, 'creative', created_at, 'New creative: '||filename, mime, null, id, updated_at from data.media where deleted_at is null
union all
select client_id, source, 'meeting', occurred_at, 'Meeting notes: '||coalesce(title,''), left(body,200), url, id, updated_at from data.messages;
