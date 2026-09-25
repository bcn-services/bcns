-- bcns-data: shop/redact automation (docs/architecture/retention-30d-shop-redact.md, shipped).
--
-- A queue table plus one narrow RPC the shopify-shop-redact Edge Function writes through after it
-- has independently re-verified the Shopify HMAC — nothing here is reachable any other way.
--
-- WHY api.record_shop_redact instead of a direct table grant: the Edge Function has no caller JWT
-- (HMAC is its only auth) and calls in as the service role. service_role has NO usage on `data` or
-- `api` today (_shared/deps.ts's own comment, confirmed by 20260912000200_access.sql's blanket
-- revoke + default-privilege revoke) and PostgREST only exposes `api` — widening that to a table
-- grant on data.privacy_requests would give service_role a foothold on the `data` schema this
-- migration is explicit about NOT doing. Instead: one SECURITY DEFINER function, pinned
-- search_path (20260914000100 pattern), EXECUTE revoked from everyone then granted to service_role
-- alone. The one grant this still requires is `usage on schema api to service_role` — schema USAGE
-- conveys no table or function access by itself (PostgREST/Postgres refuses "permission denied for
-- schema api" without it before EXECUTE is even checked), so this stays the narrow path, not the
-- "broad service_role schema usage" the design explicitly rules out.
create table data.privacy_requests (
  id           bigint generated always as identity primary key,
  topic        text not null check (topic = 'shop/redact'),
  shop         text not null check (shop ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  webhook_id   text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'done', 'needs_operator')),
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  -- S2: a row failing repeatedly (bumped by the worker, outside the row's own failed transaction)
  -- becomes an operator escalation instead of a silent forever-retry.
  attempts     int not null default 0
);
create index on data.privacy_requests (status) where status = 'pending';

alter table data.privacy_requests enable row level security;
alter table data.privacy_requests force row level security;
-- No policies: the worker reads/writes this with the pooled postgres role (bypasses RLS like
-- every other data.* table the worker touches directly, e.g. connector_schedule), and nobody else
-- reaches it at all — not even service_role (see revoke below).
revoke all on data.privacy_requests from public, anon, authenticated, service_role;

create function api.record_shop_redact(p_shop text, p_webhook_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into data.privacy_requests (topic, shop, webhook_id)
  values ('shop/redact', p_shop, p_webhook_id)
  on conflict (webhook_id) do nothing;
  -- FOUND reflects whether the INSERT actually added a row: true on a new request,
  -- false on a replay of a webhook id already queued (or already done/needs_operator).
  return found;
end $$;

-- N1: service_role's EXECUTE surface in `api` must be exactly this one function, never whatever
-- happens to default to PUBLIC on some future api.* function — revoke everything first, then
-- allow-list only record_shop_redact. This RPC has no caller JWT to check, unlike
-- api.add_member's authenticated grant.
revoke execute on all functions in schema api from service_role;
revoke all on function api.record_shop_redact(text, text) from public, anon, authenticated, service_role;
grant execute on function api.record_shop_redact(text, text) to service_role;
grant usage on schema api to service_role;
