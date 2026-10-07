-- Item 1: self-serve Stripe Checkout and the payment gate. Additive only.
--
-- A `pending` sign-up pays $200/mo through Stripe Checkout; the signed webhook (hub route ->
-- `stripe-webhook` Edge Function, which re-verifies) flips pending -> active with no bcns step.
-- A client that has paid and then lapses (retries exhausted or canceled) keeps access for 30 days
-- (grace_until), after which the worker's pauseLapsed step sets `paused`. Paying again resumes.
-- A client that never paid stays pending. Nothing here ever sets or leaves `churned`.
--
-- Shopify-billed tenants (installed the public Shopify app and never paid us) are exempt
-- everywhere: data.shopify_billed() gates every write below, and the hub never offers them Pay.
--
-- Write path: service_role only, like api.record_shop_redact (20260924000300). The Edge Function
-- reads one client's state (api.stripe_billing_state), decides in TypeScript (app-core
-- decideBilling, byte-identical copy), then applies through api.stripe_apply_billing, whose UPDATE
-- repeats every precondition in its WHERE so a bug in the TS half cannot activate a churned,
-- Shopify-billed or already-moved client.

alter table data.clients
  add column stripe_customer_id     text unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$'),
  add column stripe_subscription_id text check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{1,250}$'),
  add column paid_at                timestamptz,
  add column grace_until            timestamptz,
  add constraint clients_grace_needs_payment check (grace_until is null or paid_at is not null);

-- One row per APPLIED Stripe event: replay dedupe, and the newest-applied time that makes a
-- late or retried older event a no-op. Ignored events are never recorded.
create table data.stripe_events (
  event_id      text primary key check (event_id ~ '^evt_[A-Za-z0-9]{1,250}$'),
  client_id     uuid not null references data.clients(id) on delete cascade,
  event_type    text not null check (length(event_type) between 1 and 100),
  event_created timestamptz not null,
  action        text not null check (action in ('activate', 'resume', 'record_payment', 'start_grace', 'flag_duplicate')),
  received_at   timestamptz not null default now()
);
create index stripe_events_client_created on data.stripe_events (client_id, event_created desc);
-- No policy and no grant: only the SECURITY DEFINER functions below touch it.
alter table data.stripe_events enable row level security;
alter table data.stripe_events force row level security;

-- Same predicate as data.revoke_shopify_install (20260930000100): a live public-app Shopify
-- connection (config has no `app`, the bridge app's marker). `paid_at is null` keeps a client who
-- pays us and later connects Shopify on Stripe, so a canceled card cannot hide behind Shopify.
-- Lives in data because no api function body may name the token table (catalog.test.ts).
create function data.shopify_billed(p_client uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from data.clients c
    join data.connector_schedule s on s.client_id = c.id
    join data.source_tokens tk on (tk.client_id, tk.source) = (s.client_id, s.source)
    where c.id = p_client and c.paid_at is null
      and s.source = 'shopify' and s.config->>'app' is null and tk.status <> 'revoked')
$$;
revoke all on function data.shopify_billed(uuid) from public, anon, authenticated, service_role;

-- The hub's read, as the signed-in user, whatever the client's status (a pending or paused token
-- carries no client_id claim, so this goes by auth.uid()). The customer id is for owners only:
-- the hub needs it to open the billing portal.
create function api.billing_self() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rec record;
begin
  select m.role, c.id, c.status, c.paid_at, c.grace_until, c.stripe_customer_id into rec
  from data.memberships m join data.clients c on c.id = m.client_id
  where m.user_id = auth.uid();
  if rec is null then
    raise exception using errcode = 'BCNS0', message = 'no_tenant';
  end if;
  return jsonb_build_object(
    'client_id', rec.id,
    'role', rec.role,
    'status', rec.status,
    'paid_at', extract(epoch from rec.paid_at)::bigint,
    'grace_until', extract(epoch from rec.grace_until)::bigint,
    'shopify_billed', data.shopify_billed(rec.id),
    'stripe_customer_id', case when rec.role = 'owner' then rec.stripe_customer_id end);
end $$;
revoke all on function api.billing_self() from public, anon, service_role;
grant execute on function api.billing_self() to authenticated;

-- Edge Function read: one client by id (Checkout's client_reference_id / subscription metadata),
-- else by Stripe customer id. Null when neither matches (another product's customer).
create function api.stripe_billing_state(p_client uuid, p_customer text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare rec record;
begin
  select c.id, c.status, c.paid_at, c.grace_until, c.stripe_subscription_id into rec
  from data.clients c
  where case when p_client is not null then c.id = p_client else c.stripe_customer_id = p_customer end;
  if rec is null then return null; end if;
  return jsonb_build_object(
    'client_id', rec.id,
    'status', rec.status,
    'paid_at', extract(epoch from rec.paid_at)::bigint,
    'grace_until', extract(epoch from rec.grace_until)::bigint,
    'subscription_id', rec.stripe_subscription_id,
    'shopify_billed', data.shopify_billed(rec.id),
    'last_event_at', (select extract(epoch from max(e.event_created))::bigint
                        from data.stripe_events e where e.client_id = rec.id));
end $$;
revoke all on function api.stripe_billing_state(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.stripe_billing_state(uuid, text) to service_role;

-- Edge Function write. Returns 'applied', 'duplicate' (event id already applied) or 'conflict'
-- (a precondition no longer holds: nothing changed, the event row is removed so Stripe's retry
-- is decided afresh against the new state).
--
-- Two subscriptions for one client: the first one applied wins. A payment naming a different
-- subscription while the stored one is still live (active, no grace) is 'flag_duplicate': the
-- client row keeps its customer and subscription, and one data.notifications row per extra
-- subscription tells bcns to cancel one (the worker's alert pass emails it). 'record_payment'
-- refuses that case, so the stored subscription is never overwritten silently. In grace or
-- paused the stored one has lapsed and a new payment replaces it (record_payment / resume).
create function api.stripe_apply_billing(
  p_event_id text, p_event_type text, p_event_created timestamptz, p_client uuid,
  p_action text, p_customer text, p_subscription text, p_grace_until timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare n int; kept text;
begin
  if p_client is null or p_event_created is null
     or p_action not in ('activate', 'resume', 'record_payment', 'start_grace', 'flag_duplicate')
     or (p_action = 'start_grace' and p_grace_until is null) then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'action';
  end if;

  -- One event at a time per client, so the newest-applied check below cannot race a sibling.
  perform pg_advisory_xact_lock(hashtext('stripe_billing:' || p_client::text));
  insert into data.stripe_events (event_id, client_id, event_type, event_created, action)
  values (p_event_id, p_client, p_event_type, p_event_created, p_action)
  on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  update data.clients c set
    status = case when p_action in ('activate', 'resume') then 'active'::data.client_status else c.status end,
    paid_at = case when p_action in ('start_grace', 'flag_duplicate') then c.paid_at else greatest(c.paid_at, p_event_created) end,
    grace_until = case when p_action = 'start_grace' then p_grace_until when p_action = 'flag_duplicate' then c.grace_until end,
    stripe_customer_id = case when p_action in ('start_grace', 'flag_duplicate') then c.stripe_customer_id
                              else coalesce(p_customer, c.stripe_customer_id) end,
    stripe_subscription_id = case when p_action in ('start_grace', 'flag_duplicate') then c.stripe_subscription_id
                                  else coalesce(p_subscription, c.stripe_subscription_id) end
  where c.id = p_client
    -- The activation guard: only pending -> active and (paid before) paused -> active. Never churned.
    and c.status = case p_action when 'activate' then 'pending'::data.client_status
                                 when 'resume' then 'paused'::data.client_status
                                 else 'active'::data.client_status end
    and (p_action <> 'resume' or c.paid_at is not null)
    and (p_action <> 'start_grace' or (c.paid_at is not null and c.grace_until is null
         and (c.stripe_subscription_id is null or c.stripe_subscription_id = p_subscription)))
    -- Never overwrite a stored, still-live subscription with another one (see flag_duplicate).
    and (p_action <> 'record_payment' or p_subscription is null or c.stripe_subscription_id is null
         or c.stripe_subscription_id = p_subscription or c.grace_until is not null)
    and (p_action <> 'flag_duplicate' or (c.grace_until is null and c.stripe_subscription_id is not null
         and p_subscription is not null and c.stripe_subscription_id <> p_subscription))
    and not data.shopify_billed(c.id)
    and not exists (select 1 from data.stripe_events e
                    where e.client_id = p_client and e.event_id <> p_event_id and e.event_created > p_event_created)
  returning c.stripe_subscription_id into kept;
  get diagnostics n = row_count;
  if n = 0 then
    delete from data.stripe_events where event_id = p_event_id;
    return 'conflict';
  end if;
  if p_action = 'flag_duplicate' then
    insert into data.notifications (client_id, kind, dedupe_key, payload)
    values (p_client, 'stripe_second_subscription',
            'stripe_second_subscription:' || p_client || ':' || p_subscription,
            jsonb_build_object('kept', kept, 'other', p_subscription, 'event', p_event_id))
    on conflict (dedupe_key) do nothing;
  end if;
  return 'applied';
end $$;
revoke all on function api.stripe_apply_billing(text, text, timestamptz, uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function api.stripe_apply_billing(text, text, timestamptz, uuid, text, text, text, timestamptz)
  to service_role;

-- Grace expiry. Stripe sends nothing when grace_until passes, so the worker's housekeeping tick
-- (pauseLapsed, every run) calls this. Idempotent: a paused row no longer matches.
create function data.pause_lapsed_clients() returns int
language plpgsql set search_path = '' as $$
declare n int;
begin
  update data.clients c set status = 'paused'
  where c.status = 'active' and c.paid_at is not null
    and c.grace_until is not null and c.grace_until <= now()
    and not data.shopify_billed(c.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function data.pause_lapsed_clients() from public, anon, authenticated, service_role;

-- The hook learns that `paused` signs in like `pending`: tenant-less, with only the status marker,
-- so a lapsed owner reaches /pending and can pay to resume. No client_id claim means
-- data.active_client_id() is null: every api view stays empty, every RPC raises BCNS0, the MCP
-- server refuses the token (no client claim), and the worker already skips non-active clients.
-- churned and no-membership keep the 403.
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rec record; claims jsonb := event->'claims';
begin
  select mem.client_id, mem.role, c.status into rec
  from data.memberships mem join data.clients c on c.id = mem.client_id
  where mem.user_id = (event->>'user_id')::uuid;
  if rec is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'no membership'));
  end if;
  if rec.status in ('pending', 'paused') then
    -- Signed in, tenant-less: strip any tenant claim and add only the marker.
    claims := (coalesce(claims, '{}'::jsonb) - 'client_id' - 'client_role') || jsonb_build_object('client_status', rec.status);
    return jsonb_set(event, '{claims}', claims);
  end if;
  if rec.status <> 'active' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'client ' || rec.status));
  end if;
  claims := coalesce(claims, '{}'::jsonb) || jsonb_build_object('client_id', rec.client_id, 'client_role', rec.role);
  return jsonb_set(event, '{claims}', claims);
end $$;
-- CREATE OR REPLACE keeps the existing grants (20260912000200_access.sql); nothing to re-grant.
