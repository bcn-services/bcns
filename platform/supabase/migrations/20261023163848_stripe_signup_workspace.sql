-- Pay-first sign-up: a paid Checkout creates the workspace. Additive only.
--
-- /signup collects a business name and email, sends the visitor to Stripe Checkout and creates
-- NOTHING. When `checkout.session.completed` arrives with that signup metadata and no client
-- reference, the `stripe-webhook` Edge Function creates (or finds) the auth user and calls this
-- function, which writes everything else in ONE transaction: the client already `active` with the
-- Stripe ids and paid_at set, the owner membership, and the data.stripe_events row that later
-- lifecycle events (invoice.paid, subscription updates) order against.
--
-- Idempotent on the Stripe customer id. A subscription-mode Checkout session creates exactly one
-- customer, so one paid session = one customer = one workspace: a replayed event, and a second
-- event for the same session, both find the client by `stripe_customer_id` (UNIQUE) and answer
-- 'duplicate' without writing. The caller sends the confirmation mail only on 'created'.
--
-- Returns:
--   'created'        a new active workspace; send the confirm/set-password mail.
--   'duplicate'      this customer already has its workspace; nothing written.
--   'has_workspace'  the user already belongs to a client (a second payment for the same email,
--                    or a Shopify-path sign-up): nothing created, one data.notifications row so
--                    bcns refunds the extra payment in the Stripe dashboard.
--
-- Callable by service_role only (the Edge Function), same allow-list shape as
-- api.signup_create_client (20261001000200). The 10-per-hour pending cap does not apply: this
-- client is never pending, and payment is the bound on abuse.

create function api.stripe_signup_workspace(
  p_event_id text, p_event_type text, p_event_created timestamptz,
  p_user_id uuid, p_name text, p_customer text, p_subscription text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_id uuid;
  v_existing uuid;
  n int := 1;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]{1,250}$'
     or p_event_type is null or length(p_event_type) not between 1 and 100
     or p_event_created is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'event';
  end if;
  if p_user_id is null then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'user';
  end if;
  if length(v_name) not between 1 and 100 then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'name';
  end if;
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]{1,250}$'
     or (p_subscription is not null and p_subscription !~ '^sub_[A-Za-z0-9]{1,250}$') then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'stripe';
  end if;

  -- Two events for one session arrive on different connections: serialize them per customer.
  perform pg_advisory_xact_lock(hashtext('stripe_signup:' || p_customer));
  if exists (select 1 from data.clients c where c.stripe_customer_id = p_customer) then
    return 'duplicate';
  end if;

  select m.client_id into v_existing from data.memberships m where m.user_id = p_user_id;
  if found then
    insert into data.notifications (client_id, kind, dedupe_key, payload)
    values (v_existing, 'stripe_second_subscription',
            'stripe_signup_existing:' || p_customer,
            jsonb_build_object('customer', p_customer, 'subscription', p_subscription, 'event', p_event_id))
    on conflict (dedupe_key) do nothing;
    return 'has_workspace';
  end if;

  -- Slug exactly as api.signup_create_client builds it (kept in step by hand: that function also
  -- enforces the pending cap and inserts a pending client, neither of which applies here).
  v_base := btrim(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), 32), '-');
  if length(v_base) < 2 then v_base := 'client'; end if;
  v_slug := v_base;
  while exists (select 1 from data.clients c where c.slug = v_slug) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;

  insert into data.clients (slug, name, status, stripe_customer_id, stripe_subscription_id, paid_at)
  values (v_slug, v_name, 'active', p_customer, p_subscription, p_event_created)
  returning id into v_id;
  insert into data.memberships (user_id, client_id, role) values (p_user_id, v_id, 'owner');
  insert into data.stripe_events (event_id, client_id, event_type, event_created, action)
  values (p_event_id, v_id, p_event_type, p_event_created, 'activate')
  on conflict (event_id) do nothing;
  return 'created';
end $$;

revoke all on function api.stripe_signup_workspace(text, text, timestamptz, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.stripe_signup_workspace(text, text, timestamptz, uuid, text, text, text)
  to service_role;
