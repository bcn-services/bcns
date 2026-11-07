-- App Store 2.1.4 (round 3): bcns Connect's revenue/orders disagreed with native Shopify Analytics.
-- daily_summary_v1 summed raw minor units across currencies (a store whose currency changed holds
-- orders in several), counted cancelled orders, and ignored refunds. Redefine to Shopify's
-- "Total sales" / "Orders" for one reporting currency. Same columns, same order; replace in place.
--
--   reporting currency = currency of the tenant's newest order (a store reports in its current one).
--     Orders in an older currency are left out: Shopify Analytics converts them at historical rates,
--     which bcns does not hold. Known limit, documented in w6a-shopify-submission.md section 8.
--   revenue_minor      = order totals (net of discounts, incl. tax + shipping) + refunds (negative, on
--                        the refund day), cancelled orders and their refunds excluded.
--   orders             = non-cancelled orders in the reporting currency (test orders never reach data.money).
--   refunds_minor      = the refund half of revenue_minor, unchanged meaning, same exclusions.
--   payouts_minor      = unchanged (not currency-filtered).
--   aov_minor          = order totals / orders, refunds not deducted (Shopify's AOV excludes returns).
create or replace view api.daily_summary_v1 with (security_invoker = true) as
with rc as (
  select distinct on (client_id) client_id, currency from data.money where kind = 'order' order by client_id, occurred_at desc),
elig as (
  select mo.client_id, mo.day, mo.kind, mo.amount_minor, mo.currency, mo.updated_at
  from data.money mo left join rc using (client_id)
  where mo.kind = 'payout'
     or (mo.currency = rc.currency and (
           (mo.kind = 'order' and mo.attributes->>'cancelled_at' is null)
        or (mo.kind = 'refund' and not exists (
              select 1 from data.money o
              where o.client_id = mo.client_id and o.kind = 'order'
                and o.external_id = mo.attributes->>'order_external_id' and o.attributes->>'cancelled_at' is not null))))
),
days as (select client_id, day from data.money union select client_id, day from data.daily_metrics),
m as (select client_id, day,
        sum(amount_minor) filter (where kind in ('order', 'refund')) as revenue_minor,
        count(*)          filter (where kind = 'order')              as orders,
        sum(amount_minor) filter (where kind = 'order')              as orders_minor,
        sum(amount_minor) filter (where kind = 'refund')             as refunds_minor,
        sum(amount_minor) filter (where kind = 'payout')             as payouts_minor,
        coalesce(max(currency) filter (where kind in ('order', 'refund')), max(currency)) as currency,
        max(updated_at) as m_upd
      from elig group by 1, 2),
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
       case when coalesce(m.orders,0) > 0 then round(m.orders_minor::numeric / m.orders) end as aov_minor,
       d.sessions, d.inventory_units,
       coalesce(d.conversion_rate_src,
                case when d.sessions > 0 then m.orders::numeric / d.sessions end) as conversion_rate,
       d.ad_spend_minor, d.ad_purchase_value_minor, d.ad_currency, d.ad_impressions, d.ad_clicks, d.ad_purchases,
       case when d.ad_spend_minor > 0 then round(d.ad_purchase_value_minor / d.ad_spend_minor, 4) end as roas,
       greatest(coalesce(m.m_upd, '-infinity'), coalesce(d.d_upd, '-infinity')) as updated_at
from days left join m using (client_id, day) left join d using (client_id, day);
