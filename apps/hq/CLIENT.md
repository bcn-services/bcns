# CLIENT.md — HQ

bcns's internal command center: the one place Nate and Brandon work leads, tasks and numbers.

- **Slug / port:** `hq` / 3105 (`infra/ports.txt`). Package `@bcn-services/hq`.
- **Data:** its own Supabase project (`apps/hq/supabase`, migrations 0001-0027), NOT the shared platform project.
- **Auth:** email + password, host-only cookies (separate from Connect). Access = a `profiles` row (handle `nate`|`brandon`); `middleware.ts` denies a session without one.
- **Keys:** anon key only. No service-role key (`scripts/check-env.ts` fails the build on it), no platform `DATABASE_URL`.
- **Shell:** variant-g layout. `components/Board.tsx` is sections, rows, detail pane with j/k/enter/esc/1-4; pages supply data.
- **Views:** Today (per-handle sections), Leads, Work, Clients, Numbers. Everything but Today is a placeholder until its item lands.
- **Not shared-platform:** no `@bcn-services/{tenant,data-client,app-core,ui}`, no `EXPECTED_CLIENT_ID`, no tenant pin.
- **Public paths:** `/login /signout /api/health /mcp /authorize /token /register /.well-known/*` only.
- **Design and decisions:** `docs/architecture/hq.md`.
