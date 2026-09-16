-- bcns-data: schemas, types, tables, triggers, partitions (DESIGN.md §1)

create schema if not exists data;
create schema if not exists api;
create extension if not exists btree_gin with schema extensions;

create type data.source        as enum ('shopify','meta','monday','meet','upload','dashboard','platform');
create type data.client_status as enum ('active','paused','churned');
create type data.member_role   as enum ('member','owner');
create type data.token_kind    as enum ('shopify_admin','monday_personal','meta_system_user','google_oauth_refresh');
create type data.token_status  as enum ('active','auth_failed','revoked');
create type data.run_mode      as enum ('backfill','incremental','renormalize');
create type data.run_status    as enum ('running','ok','error','auth_failed');
create type data.health_status as enum ('ok','stale','auth_failed','error','never_ran');

-- ---------------------------------------------------------------- helpers
create function data.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- 1.1 tenancy
create table data.clients (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name               text not null,
  status             data.client_status not null default 'active',
  timezone           text not null default 'America/New_York',
  egress_quota_bytes bigint not null default 21474836480,
  churned_at         timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger touch before update on data.clients for each row execute function data.touch_updated_at();

create function data.clients_timezone_valid() returns trigger language plpgsql as $$
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    raise exception using errcode = 'BCNS3', message = 'validation', detail = 'timezone';
  end;
  return new;
end $$;
create trigger clients_timezone_valid before insert or update of timezone on data.clients
  for each row execute function data.clients_timezone_valid();

create function data.clients_status_changed() returns trigger language plpgsql as $$
begin
  if new.status = 'churned' and old.status is distinct from 'churned' then new.churned_at := now(); end if;
  return new;
end $$;
create trigger clients_status_changed before update of status on data.clients
  for each row execute function data.clients_status_changed();

create table data.memberships (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  client_id  uuid not null references data.clients(id) on delete cascade,
  role       data.member_role not null default 'member',
  is_smoke   boolean not null default false,
  created_at timestamptz not null default now()
);
create index on data.memberships (client_id);

create table data.source_tokens (
  client_id         uuid not null references data.clients(id) on delete cascade,
  source            data.source not null,
  kind              data.token_kind not null,
  secret            text not null,
  refresh_secret    text,
  expires_at        timestamptz,
  last_refreshed_at timestamptz,
  status            data.token_status not null default 'active',
  status_detail     text,
  attributes        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (client_id, source)
);
create trigger touch before update on data.source_tokens for each row execute function data.touch_updated_at();

create table data.dashboard_versions (
  client_id   uuid primary key references data.clients(id) on delete cascade,
  api_version text not null,
  app_version text not null,
  reported_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 1.2 scheduling and runs
create table data.connector_schedule (
  client_id                uuid not null references data.clients(id) on delete cascade,
  source                   data.source not null,
  enabled                  boolean not null default true,
  interval                 interval not null,
  backfill_from            date not null,
  backfill_cursor          jsonb,
  incremental_cursor       jsonb not null default '{}'::jsonb,
  renormalize_cursor       jsonb,
  config                   jsonb not null default '{}'::jsonb,
  next_run_at              timestamptz not null default now(),
  lease_until              timestamptz,
  lease_owner              text,
  last_run_at              timestamptz,
  last_success_at          timestamptz,
  last_error               text,
  last_error_at            timestamptz,
  consecutive_failures     int not null default 0,
  renormalize_requested_at timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (client_id, source)
);
create index on data.connector_schedule (next_run_at) where enabled;
create trigger touch before update on data.connector_schedule for each row execute function data.touch_updated_at();

create function data.clients_timezone_changed() returns trigger language plpgsql as $$
begin
  if new.timezone is distinct from old.timezone then
    update data.connector_schedule set renormalize_requested_at = now() where client_id = new.id;
  end if;
  return null;
end $$;
create trigger clients_timezone_changed after update of timezone on data.clients
  for each row execute function data.clients_timezone_changed();

create table data.worker_leases (
  name        text primary key,
  lease_until timestamptz not null,
  owner       text not null
);

create table data.download_tickets (
  client_id    uuid not null references data.clients(id) on delete cascade,
  storage_path text not null,
  expires_at   timestamptz not null,
  primary key (client_id, storage_path)
);
create index on data.download_tickets (expires_at);

create table data.connector_runs (
  id            bigint generated always as identity primary key,
  client_id     uuid not null references data.clients(id) on delete cascade,
  source        data.source not null,
  mode          data.run_mode not null,
  status        data.run_status not null default 'running',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  pages         int not null default 0,
  rows_fetched  int not null default 0,
  rows_upserted int not null default 0,
  entity_rows   jsonb not null default '{}',  -- per-entity fetched counts; §5.5 zero-row rule is per entity
  error         text,
  lease_owner   text
);
create index on data.connector_runs (client_id, source, started_at desc);
create index on data.connector_runs (started_at) where status = 'running';

create table data.connector_health (
  client_id       uuid not null references data.clients(id) on delete cascade,
  source          data.source not null,
  status          data.health_status not null,
  status_since    timestamptz not null,
  last_run_at     timestamptz,
  last_success_at timestamptz,
  last_error      text,
  computed_at     timestamptz not null default now(),
  primary key (client_id, source)
);

create table data.notifications (
  id         bigint generated always as identity primary key,
  client_id  uuid references data.clients(id) on delete set null,
  kind       text not null,
  dedupe_key text not null unique,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   int not null default 0,
  last_error text
);
create index on data.notifications (created_at) where sent_at is null;

create table data.egress_ledger (
  client_id  uuid not null references data.clients(id) on delete cascade,
  month      date not null,
  bytes      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (client_id, month)
);

-- ---------------------------------------------------------------- 1.3 raw
create table data.raw (
  client_id         uuid not null,
  source            data.source not null,
  entity            text not null,
  external_id       text not null,
  fetched_at        timestamptz not null default now(),
  source_updated_at timestamptz,
  run_id            bigint,
  payload_hash      text not null,
  payload           jsonb not null,
  primary key (client_id, source, entity, external_id, fetched_at)
) partition by range (fetched_at);
create index on data.raw (client_id, source, entity, fetched_at);

create table data.raw_latest (
  client_id    uuid not null,
  source       data.source not null,
  entity       text not null,
  external_id  text not null,
  payload_hash text not null,
  fetched_at   timestamptz not null,
  primary key (client_id, source, entity, external_id)
);

-- Creates partitions for the current month through month+2. Idempotent; serialised by an
-- advisory lock. New partitions get RLS enabled+forced and no grants (D21).
create function data.ensure_raw_partitions() returns void language plpgsql as $$
declare m date; p text;
begin
  perform pg_advisory_xact_lock(hashtext('raw_partitions'));
  for i in 0..2 loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    p := 'raw_' || to_char(m, 'YYYY_MM');
    execute format('create table if not exists data.%I partition of data.raw for values from (%L) to (%L)',
                   p, m, m + interval '1 month');
    execute format('alter table data.%I enable row level security', p);
    execute format('alter table data.%I force row level security', p);
    execute format('revoke all on data.%I from anon, authenticated', p);
  end loop;
end $$;

-- ---------------------------------------------------------------- 1.4 canonical
create table data.customers (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references data.clients(id),
  source            data.source not null,
  external_id       text not null,
  attributes        jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  email             text,
  name              text,
  first_order_at    timestamptz,
  orders_count      int,
  total_spent_minor bigint,
  currency          char(3),
  unique (client_id, source, external_id)
);
create index on data.customers (client_id, updated_at);
create index on data.customers (client_id, email);
create trigger touch before update on data.customers for each row execute function data.touch_updated_at();

create table data.jobs (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references data.clients(id),
  source            data.source not null,
  external_id       text not null,
  attributes        jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  kind              text not null default 'task',
  title             text not null,
  status            text,
  is_done           boolean not null default false,
  priority          text,
  group_name        text,
  owner             text,
  due_on            date,
  url               text,
  deleted_at        timestamptz,
  unique (client_id, source, external_id)
);
create index on data.jobs (client_id, updated_at);
create index on data.jobs (client_id, is_done, due_on);
create index on data.jobs (client_id, source_updated_at desc) where is_done;
create trigger touch before update on data.jobs for each row execute function data.touch_updated_at();

create table data.messages (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references data.clients(id),
  source            data.source not null,
  external_id       text not null,
  attributes        jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  kind              text not null,
  title             text,
  body              text,
  occurred_at       timestamptz not null,
  participants      text[],
  url               text,
  unique (client_id, source, external_id)
);
create index on data.messages (client_id, updated_at);
create index on data.messages (client_id, kind, occurred_at desc);
create trigger touch before update on data.messages for each row execute function data.touch_updated_at();

create table data.money (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references data.clients(id),
  source               data.source not null,
  external_id          text not null,
  attributes           jsonb not null default '{}'::jsonb,
  source_updated_at    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  kind                 text not null check (kind in ('order','refund','payout')),
  occurred_at          timestamptz not null,
  day                  date not null,
  amount_minor         bigint not null,
  currency             char(3) not null,
  status               text,
  order_number         text,
  customer_external_id text,
  items_count          int,
  url                  text,
  unique (client_id, source, external_id)
);
create index on data.money (client_id, updated_at);
create index on data.money (client_id, day);
create index on data.money (client_id, kind, occurred_at desc);
create index on data.money (client_id, occurred_at desc);
create trigger touch before update on data.money for each row execute function data.touch_updated_at();

create table data.media (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references data.clients(id),
  source            data.source not null,
  external_id       text not null,
  attributes        jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  kind              text not null check (kind in ('image','video','file')),
  storage_path      text,
  thumb_path        text,
  filename          text not null,
  mime              text,
  bytes             bigint,
  width             int,
  height            int,
  title             text,
  tags              text[] not null default '{}',
  uploaded_by       uuid references auth.users(id),
  thumb_error       text,
  deleted_at        timestamptz,
  purge_after       timestamptz,
  unique (client_id, source, external_id)
);
create index on data.media (client_id, updated_at);
create index on data.media (client_id, source, deleted_at, created_at desc);
create index on data.media using gin (client_id, tags);
create index on data.media (purge_after) where deleted_at is not null;
create index on data.media (created_at) where thumb_path is null and kind = 'image' and deleted_at is null
  and storage_path is not null and thumb_error is null;
create trigger touch before update on data.media for each row execute function data.touch_updated_at();

create table data.media_sets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references data.clients(id),
  name        text not null,
  description text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, name)
);
create index on data.media_sets (client_id, updated_at);
create trigger touch before update on data.media_sets for each row execute function data.touch_updated_at();

create table data.media_set_items (
  client_id uuid not null references data.clients(id),
  set_id    uuid not null references data.media_sets(id) on delete cascade,
  media_id  uuid not null references data.media(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (client_id, set_id, media_id)
);
create index on data.media_set_items (client_id, media_id);

create table data.products (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references data.clients(id),
  source             data.source not null,
  external_id        text not null,
  attributes         jsonb not null default '{}'::jsonb,
  source_updated_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  title              text not null,
  handle             text,
  status             text,
  vendor             text,
  product_type       text,
  price_minor        bigint,
  currency           char(3),
  inventory_quantity int,
  variants_count     int,
  image_url          text,
  url                text,
  unique (client_id, source, external_id)
);
create index on data.products (client_id, updated_at);
create trigger touch before update on data.products for each row execute function data.touch_updated_at();

create table data.metric_defs (
  name text primary key,
  unit text not null check (unit in ('count','minor','ratio'))
);
insert into data.metric_defs (name, unit) values
  ('sessions','count'), ('conversion_rate','ratio'), ('inventory_units','count'), ('spend','minor'),
  ('impressions','count'), ('clicks','count'), ('reach','count'), ('purchases','count'), ('purchase_value','minor');

create table data.daily_metrics (
  client_id   uuid not null references data.clients(id),
  source      data.source not null,
  day         date not null,
  entity_kind text not null,
  entity_id   text not null,
  metric      text not null references data.metric_defs(name),
  value       numeric not null,
  currency    char(3),
  updated_at  timestamptz not null default now(),
  primary key (client_id, source, day, entity_kind, entity_id, metric)
);
create index on data.daily_metrics (client_id, day);
create index on data.daily_metrics (client_id, entity_kind, entity_id, day);
create index on data.daily_metrics (client_id, updated_at);
create trigger touch before update on data.daily_metrics for each row execute function data.touch_updated_at();

create table data.records (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references data.clients(id),
  source            data.source not null,
  external_id       text not null,
  attributes        jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  kind              text not null check (kind ~ '^[a-z_]{1,64}$'),
  title             text,
  body              text,
  occurred_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (client_id, source, external_id)
);
create index on data.records (client_id, updated_at);
create index on data.records (client_id, kind, occurred_at desc);
create trigger touch before update on data.records for each row execute function data.touch_updated_at();

-- ---------------------------------------------------------------- 1.5 helpers
create function data.local_day(ts timestamptz, client uuid) returns date language sql stable as $$
  select (ts at time zone (select timezone from data.clients where id = client))::date $$;

-- platform seeds (needed in every environment, not only CI)
insert into data.worker_leases (name, lease_until, owner) values ('housekeeping', 'epoch', 'seed');
select data.ensure_raw_partitions();
