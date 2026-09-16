-- bcns-data: api views (DESIGN.md §3.2). security_invoker; every view exposes client_id, source, updated_at.

create view api.client_v1 with (security_invoker = true) as
  select id as client_id, 'platform'::data.source as source, name, slug, timezone, status, egress_quota_bytes, updated_at
  from data.clients;

create view api.money_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, occurred_at, day, amount_minor, currency, status, order_number,
         customer_external_id, items_count, url, attributes, source_updated_at, updated_at
  from data.money;

create view api.daily_metrics_v1 with (security_invoker = true) as
  select client_id, source, day, entity_kind, entity_id, metric, value, currency, updated_at
  from data.daily_metrics;

create view api.daily_summary_v1 with (security_invoker = true) as
with days as (select client_id, day from data.money union select client_id, day from data.daily_metrics),
m as (select client_id, day,
        sum(amount_minor) filter (where kind = 'order')  as revenue_minor,
        count(*)          filter (where kind = 'order')  as orders,
        sum(amount_minor) filter (where kind = 'refund') as refunds_minor,
        sum(amount_minor) filter (where kind = 'payout') as payouts_minor,
        max(currency) as currency,
        max(updated_at) as m_upd
      from data.money group by 1, 2),
d as (select client_id, day,
        sum(value) filter (where metric = 'sessions')                        as sessions,
        max(value) filter (where metric = 'conversion_rate')                 as conversion_rate_src,
        max(value) filter (where metric = 'inventory_units')                 as inventory_units,
        sum(value) filter (where metric = 'spend'          and source = 'meta') as ad_spend_minor,
        sum(value) filter (where metric = 'purchase_value' and source = 'meta') as ad_purchase_value_minor,
        sum(value) filter (where metric = 'impressions'    and source = 'meta') as ad_impressions,
        sum(value) filter (where metric = 'clicks'         and source = 'meta') as ad_clicks,
        sum(value) filter (where metric = 'purchases'      and source = 'meta') as ad_purchases,
        max(currency) filter (where metric = 'spend'       and source = 'meta') as ad_currency,
        max(updated_at) as d_upd
      from data.daily_metrics where entity_kind in ('store','campaign') group by 1, 2)
select days.client_id, 'platform'::data.source as source, days.day,
       coalesce(m.revenue_minor,0) as revenue_minor, coalesce(m.orders,0) as orders,
       coalesce(m.refunds_minor,0) as refunds_minor, coalesce(m.payouts_minor,0) as payouts_minor,
       m.currency,
       case when coalesce(m.orders,0) > 0 then round(m.revenue_minor::numeric / m.orders) end as aov_minor,
       d.sessions, d.inventory_units,
       coalesce(d.conversion_rate_src,
                case when d.sessions > 0 then m.orders::numeric / d.sessions end) as conversion_rate,
       d.ad_spend_minor, d.ad_purchase_value_minor, d.ad_currency, d.ad_impressions, d.ad_clicks, d.ad_purchases,
       case when d.ad_spend_minor > 0 then round(d.ad_purchase_value_minor / d.ad_spend_minor, 4) end as roas,
       greatest(coalesce(m.m_upd, '-infinity'), coalesce(d.d_upd, '-infinity')) as updated_at
from days left join m using (client_id, day) left join d using (client_id, day);

create view api.campaign_daily_v1 with (security_invoker = true) as
with p as (
  select client_id, day, entity_id as campaign_id,
         max(value) filter (where metric = 'spend')          as spend_minor,
         max(currency) filter (where metric = 'spend')       as currency,
         max(value) filter (where metric = 'impressions')    as impressions,
         max(value) filter (where metric = 'clicks')         as clicks,
         max(value) filter (where metric = 'reach')          as reach,
         max(value) filter (where metric = 'purchases')      as purchases,
         max(value) filter (where metric = 'purchase_value') as purchase_value_minor,
         max(updated_at) as updated_at
  from data.daily_metrics where source = 'meta' and entity_kind = 'campaign' group by 1, 2, 3)
select p.client_id, 'meta'::data.source as source, p.day, p.campaign_id,
       r.title as campaign_name, r.attributes->>'effective_status' as campaign_status, r.attributes->>'objective' as objective,
       p.spend_minor, p.currency, p.impressions, p.clicks, p.reach, p.purchases, p.purchase_value_minor,
       case when p.spend_minor > 0 then round(p.purchase_value_minor / p.spend_minor, 4) end as roas,
       case when p.clicks > 0 then round(p.spend_minor / p.clicks) end as cpc_minor,
       case when p.purchases > 0 then round(p.spend_minor / p.purchases) end as cpp_minor,
       case when p.impressions > 0 then round(p.clicks / p.impressions, 4) end as ctr,
       p.updated_at
from p left join data.records r
  on r.client_id = p.client_id and r.source = 'meta' and r.kind = 'campaign' and r.external_id = p.campaign_id;

create view api.creative_daily_v1 with (security_invoker = true) as
with p as (
  select client_id, day, entity_id as ad_id,
         max(value) filter (where metric = 'spend')          as spend_minor,
         max(currency) filter (where metric = 'spend')       as currency,
         max(value) filter (where metric = 'impressions')    as impressions,
         max(value) filter (where metric = 'clicks')         as clicks,
         max(value) filter (where metric = 'reach')          as reach,
         max(value) filter (where metric = 'purchases')      as purchases,
         max(value) filter (where metric = 'purchase_value') as purchase_value_minor,
         max(updated_at) as updated_at
  from data.daily_metrics where source = 'meta' and entity_kind = 'ad' group by 1, 2, 3)
select p.client_id, 'meta'::data.source as source, p.day, p.ad_id,
       r.title as ad_name, r.attributes->>'adset_id' as adset_id, r.attributes->>'campaign_id' as campaign_id,
       r.attributes->>'image_hash' as image_hash, md.id as media_id, md.thumb_path, md.storage_path,
       p.spend_minor, p.currency, p.impressions, p.clicks, p.reach, p.purchases, p.purchase_value_minor,
       case when p.spend_minor > 0 then round(p.purchase_value_minor / p.spend_minor, 4) end as roas,
       case when p.clicks > 0 then round(p.spend_minor / p.clicks) end as cpc_minor,
       case when p.purchases > 0 then round(p.spend_minor / p.purchases) end as cpp_minor,
       case when p.impressions > 0 then round(p.clicks / p.impressions, 4) end as ctr,
       p.updated_at
from p
left join data.records r
  on r.client_id = p.client_id and r.source = 'meta' and r.kind = 'ad' and r.external_id = p.ad_id
left join data.media md
  on md.client_id = r.client_id and md.source = 'meta' and md.external_id = r.attributes->>'image_hash';

create view api.products_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, title, handle, status, vendor, product_type, price_minor, currency,
         inventory_quantity, variants_count, image_url, url, attributes, updated_at
  from data.products;

create view api.customers_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, attributes, source_updated_at, created_at, updated_at, email, name,
         first_order_at, orders_count, total_spent_minor, currency
  from data.customers;

create view api.jobs_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, title, status, is_done, priority, group_name, owner, due_on, url,
         deleted_at, source_updated_at, updated_at
  from data.jobs;

create view api.messages_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, title, body, occurred_at, participants, url, attributes, updated_at
  from data.messages;

create view api.records_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, title, body, occurred_at, attributes, updated_at
  from data.records where deleted_at is null;

create view api.media_v1 with (security_invoker = true) as
  select id, client_id, source, external_id, kind, storage_path, thumb_path, filename, mime, bytes, width, height,
         title, tags, uploaded_by, deleted_at, purge_after, created_at, updated_at
  from data.media;

create view api.media_sets_v1 with (security_invoker = true) as
  select s.id, s.client_id, 'upload'::data.source as source, s.name, s.description,
         (select count(*) from data.media_set_items i join data.media m on m.id = i.media_id
           where i.set_id = s.id and i.client_id = s.client_id and m.deleted_at is null) as file_count,
         (select m.thumb_path from data.media_set_items i join data.media m on m.id = i.media_id
           where i.set_id = s.id and i.client_id = s.client_id and m.deleted_at is null
           order by i.added_at desc limit 1) as cover_thumb_path,
         s.created_at, s.updated_at
  from data.media_sets s;

create view api.media_set_items_v1 with (security_invoker = true) as
  select client_id, 'upload'::data.source as source, set_id, media_id, added_at, added_at as updated_at
  from data.media_set_items;

create view api.activity_v1 with (security_invoker = true) as
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
  from data.media where source = 'upload' and deleted_at is null
  union all
  select client_id, source, 'meeting', occurred_at, 'Meeting notes: ' || coalesce(title, ''), left(body, 200), url, id, updated_at
  from data.messages;

create view api.connector_health_v1 with (security_invoker = true) as
  select client_id, source, status, status_since, last_run_at, last_success_at, last_error, computed_at,
         computed_at as updated_at
  from data.connector_health;

create view api.egress_status_v1 with (security_invoker = true) as
  select c.id as client_id, 'platform'::data.source as source,
         date_trunc('month', now() at time zone c.timezone)::date as month,
         coalesce(e.bytes, 0) as bytes_used, c.egress_quota_bytes as quota_bytes,
         coalesce(e.bytes, 0) >= c.egress_quota_bytes as exceeded,
         coalesce(e.updated_at, c.updated_at) as updated_at
  from data.clients c
  left join data.egress_ledger e
    on e.client_id = c.id and e.month = date_trunc('month', now() at time zone c.timezone)::date;

create view api.memberships_v1 with (security_invoker = true) as
  select client_id, 'platform'::data.source as source, user_id, role, is_smoke, created_at, created_at as updated_at
  from data.memberships;

grant select on all tables in schema api to authenticated;
