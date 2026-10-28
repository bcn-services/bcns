-- ---------------------------------------------------------------------------
-- 0035_tracks — the Work / Today board: a track is a card, its steps are the tasks that point at it.
--
-- Columns: now | next | wait | done. Done shows the last 7 days (done_at), then rolls off the board
-- (the row stays). Same posture as 0027: is_hq() reads and writes, no delete grant, anon nothing.
-- ---------------------------------------------------------------------------

begin;

create table tracks (
  id          uuid default gen_random_uuid() primary key,
  name        text not null unique,
  area        text,
  client_slug text,
  "column"    text not null default 'next' check ("column" in ('now', 'next', 'wait', 'done')),
  done_at     timestamptz,
  created_at  timestamptz default now(),
  -- a card in Done must carry the day it got there (the 7-day window reads it)
  check ("column" <> 'done' or done_at is not null)
);
create index tracks_column_idx on tracks ("column", done_at);

alter table tasks add column track_id uuid references tracks (id);
create index tasks_track_idx on tasks (track_id);

alter table tracks enable row level security;
create policy hq_select on tracks for select to authenticated using (public.is_hq());
create policy hq_insert on tracks for insert to authenticated with check (public.is_hq());
create policy hq_update on tracks for update to authenticated using (public.is_hq()) with check (public.is_hq());

grant select, insert, update on tracks to authenticated;
revoke all on tracks from anon;

commit;
