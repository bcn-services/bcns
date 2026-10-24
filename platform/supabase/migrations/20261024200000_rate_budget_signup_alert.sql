-- Connect hardening: a generic rolling-window budget for the Edge Functions, and a deduped
-- operator alert for a pay-first sign-up that failed after the customer paid.
--
-- data.rate_hits: one row per ALLOWED hit (bucket, key, at). No grants: service_role has none on
-- data.*, the SECURITY DEFINER function below is the only writer.
--
-- api.take_rate_budget: true = the hit is within `p_limit` per `p_window_seconds` and was
-- recorded; false = over budget (nothing recorded, so hammering does not extend the lockout).
-- Serialized per (bucket, key) with an advisory lock, same shape as api.signup_create_client.
-- service_role only: if `authenticated` could call it, any user could burn another user's bucket
-- through PostgREST.
--
-- api.stripe_signup_alert: one data.notifications row per (customer, reason); the worker's
-- sendPending already emails any non-client kind to BCNS_ALERT_EMAIL. Stripe retries of the same
-- event hit the dedupe key and add nothing. service_role only.
--
-- Additive only. `usage on schema api` for service_role already exists (20260924000300).

create table data.rate_hits (
  bucket text not null,
  key    text not null,
  at     timestamptz not null default now()
);
create index rate_hits_bucket_key_at on data.rate_hits (bucket, key, at);
create index rate_hits_at on data.rate_hits (at);
alter table data.rate_hits enable row level security;
alter table data.rate_hits force row level security;

create function api.take_rate_budget(p_bucket text, p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 100
     or p_key is null or length(p_key) not between 1 and 200
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = 'BCNS3', message = 'validation';
  end if;

  perform pg_advisory_xact_lock(hashtext('rate:' || p_bucket || ':' || p_key));
  -- Keep the table small: anything older than a day is past every window allowed (max 86400s).
  -- skip locked: concurrent calls for other keys never wait on, or deadlock over, the same old rows.
  delete from data.rate_hits where ctid in (
    select ctid from data.rate_hits where at < now() - interval '1 day' for update skip locked);
  select count(*) into v_count from data.rate_hits
  where bucket = p_bucket and key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into data.rate_hits (bucket, key) values (p_bucket, p_key);
  return true;
end $$;

revoke all on function api.take_rate_budget(text, text, int, int)
  from public, anon, authenticated, service_role;
grant execute on function api.take_rate_budget(text, text, int, int) to service_role;

create function api.stripe_signup_alert(p_customer text, p_event text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]{1,250}$'
     or p_event is null or p_event !~ '^evt_[A-Za-z0-9]{1,250}$'
     or p_reason is null or p_reason not in ('create_failed', 'mail_failed') then
    raise exception using errcode = 'BCNS3', message = 'validation';
  end if;
  insert into data.notifications (client_id, kind, dedupe_key, payload)
  values (null, 'stripe_signup_failed', 'stripe_signup_failed:' || p_customer || ':' || p_reason,
          jsonb_build_object('customer', p_customer, 'event', p_event, 'reason', p_reason))
  on conflict (dedupe_key) do nothing;
end $$;

revoke all on function api.stripe_signup_alert(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.stripe_signup_alert(text, text, text) to service_role;
