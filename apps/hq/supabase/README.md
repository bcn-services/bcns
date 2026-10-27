# HQ database

`migrations/0001..0026` are the bcns-internal pipeline schema, copied byte-for-byte from its `origin/main` (never edit them). `0027_hq.sql` is HQ: lead/task/finance tables, RLS gated by `is_hq()` (a `profiles` row), `decide_proposal()`, anon lock-down.

Local stack (ports 553xx, project_id `hq`; coexists with `platform/`):

```bash
supabase start    --workdir apps/hq
supabase db reset --workdir apps/hq     # applies 0001-0027
psql 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' -v ON_ERROR_STOP=1 -f apps/hq/supabase/tests/rls.sql
```

Production (Nate's step, never run by an agent; project `knmgyxlrhjxaydliucbs`):

```bash
supabase link    --workdir apps/hq --project-ref knmgyxlrhjxaydliucbs
supabase db push --workdir apps/hq
```

Turn signups off in the HQ dashboard (Auth settings); `is_hq()` requiring a `profiles` row is the backstop.
