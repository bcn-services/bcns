-- platform-v1 §4b: uploads repointed at Drive. Views only — no new table, no new RPC.
--
-- `create or replace view` is deliberate over drop/recreate: replacing keeps the
-- `grant select ... to authenticated` from 20260912000400, which a drop would
-- throw away. Postgres only allows appending columns that way, so `attributes`
-- lands at the end of media_v1 rather than beside the other views' placement.

-- api.media_v1 exposes `source` already but not `attributes`, so the Drive
-- connector's `web_view_link` is unreachable from an app today.
create or replace view api.media_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, storage_path, thumb_path, filename, mime, bytes, width, height,
         title, tags, uploaded_by, deleted_at, purge_after, created_at, updated_at, attributes
  from data.media;

-- The creative branch filtered to source = 'upload', so Drive files never
-- reached the feed. Every other branch in this view is already source-agnostic.
create or replace view api.activity_v1 with (security_invoker = true) as
  select client_id, source, kind, occurred_at,
         case kind when 'order' then 'New Shopify order #' || coalesce(order_number, external_id)
                   when 'payout' then 'Payout received'
                   else 'Refund on #' || coalesce(order_number, external_id) end as title,
         (amount_minor::text || ' ' || currency) as detail, url, id as ref_id, updated_at
  from data.money
  union all
  select client_id, source, 'task_done', source_updated_at, 'Task completed: ' || title, status, url, id, updated_at
  from data.jobs where is_done and source_updated_at is not null
  union all
  select client_id, source, 'campaign', source_updated_at, 'Campaign ' || coalesce(title, external_id) || ' updated',
         attributes->>'effective_status', null, id, updated_at
  from data.records where kind = 'campaign' and source_updated_at is not null
  union all
  select client_id, source, 'creative', created_at, 'New creative: ' || filename, mime, null, id, updated_at
  from data.media where deleted_at is null
  union all
  select client_id, source, 'meeting', occurred_at, 'Meeting notes: ' || coalesce(title, ''), left(body, 200), url, id, updated_at
  from data.messages;
