# Pre-public secret scan — bcns-data / bcns-client-sb / bcns-app-template

Scope: full git history (`git rev-list --all`, all branches on origin, all
commits including deleted files) of clean clones. `git fetch --all` run in
each first. gitleaks/trufflehog not installed; scan done with
`git rev-list --all | xargs git grep -I -n -E <pattern>` plus targeted
`git log --all --name-only` checks for `.env*` and `supabase/.temp/`.

Patterns checked: Supabase JWT (`eyJ...\.eyJ`), `sb_secret_`, `sbp_`, Shopify
(`shpat_`/`shpss_`/`shpca_`), Meta (`EAA...`), Monday tokens (context grep),
Resend (`re_...`), AWS (`AKIA...`), GitHub PATs (`ghp_`/`github_pat_`),
Google API keys (`AIza...`), private key blocks, Postgres URLs with
passwords, committed `.env`/`.env.local`/`.env.production` (excluding
`.env.example`), `supabase/.temp/`, non-test customer emails/phones, and
hard-coded IPs/hostnames.

## Verdict: bcns-data — CLEAN

- 72 commits across all branches, all scanned.
- `shpat_` hits: all in `test/scripts.test.ts`, `test/qa-shopify-rehearsal.test.ts`,
  and `.claude/dev-team/qa-report.md` — literal fixture strings
  (`shpat_test`, `shpat_fedcba9876543210`), not real tokens.
- `EAA...` hits: false positive — matches inside a base64-encoded 1x1 PNG
  test fixture in `test/data-client.test.ts` / `test/helpers.ts`.
- Postgres URL hits: all `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  — the standard local Supabase CLI dev database, not a real credential.
- "Monday" hits: all documentation/design-doc prose about token *kinds*
  (`DESIGN.md`, `REQUIREMENTS.md`) and `supabase/seed.sql` using the literal
  placeholder string `'seed-token'`. No real token value.
- No `.env`/`.env.local`/`.env.production` ever committed (only
  `.env.example`). No `supabase/.temp/` ever committed.
- Emails found outside bcn-services.com/example.com: `admin@email.com`,
  `alerts@example.test`, `buyer1..5@example.test`, `person1-2@example.test`
  — all clearly synthetic test fixtures (`.test` TLD or generic placeholder).
- No IPv4 addresses found. Hostnames found are all legitimate public API
  endpoints referenced by the connectors themselves: `adsmanager.facebook.com`,
  `api.monday.com`, `api.resend.com`, `clerk.com`, `drive.google.com`,
  `graph.facebook.com`, `shopify.dev`, `token.actions.githubusercontent.com`.
- No other pattern (sb_secret_, sbp_, shpss_/shpca_, AKIA, ghp_/github_pat_,
  AIza, private key blocks, re_) matched anywhere in history.

## Verdict: bcns-client-sb — CLEAN

- 28 commits across all branches, all scanned.
- No hits at all for: Supabase JWT, sb_secret_, sbp_, any Shopify prefix,
  EAA, re_, AKIA, ghp_/github_pat_, AIza, private key blocks.
- Postgres URL hits: only `.env.example` with the placeholder
  `postgres://postgres:password@db.your-project.supabase.co:5432/postgres`.
- No `.env`/`.env.local`/`.env.production` ever committed. No
  `supabase/.temp/` ever committed.
- "Emails" found outside allowlist: `bcns-briefing@sb.timer` (synthetic —
  `.timer` is not a real TLD, clearly a test/cron fixture address) and
  `password@db.your-project.supabase.co` (false-positive regex match on the
  placeholder Postgres URL above, not a real address).
- No IPv4 addresses found. Hostnames found are all legitimate public
  services: `adsmanager.facebook.com`, `claude.ai`, `eslint.org`,
  `fonts.gstatic.com`, `meet.google.com`, `monday.com`, `nextjs.org`,
  `unpkg.com`, plus placeholder domains `platform.test` / `x.example`.

## Verdict: bcns-app-template — CLEAN

- Freshly cloned (`git clone git@github.com:bcn-services/bcns-app-template.git`),
  `git fetch --all` run, 21 commits across all branches, all scanned.
- No hits at all for: Supabase JWT, sb_secret_, sbp_, any Shopify prefix,
  EAA, re_, AKIA, ghp_/github_pat_, AIza, private key blocks, Monday context.
- Postgres URL hits: only `.env.example`, two placeholder forms —
  `postgres://postgres:password@db.your-project.supabase.co:5432/postgres`
  and `postgres://user:password@host/dbname`.
- No `.env`/`.env.local`/`.env.production` ever committed. No
  `supabase/.temp/` ever committed.
- "Email" found outside allowlist: `password@db.your-project.supabase.co`
  — same false-positive regex match on the placeholder Postgres URL, not a
  real address.
- No IPv4 addresses found. Hostnames found: `eslint.org`, `nextjs.org`,
  `platform.test` (placeholder) — all benign.

## Overall

All three repos: **CLEAN**. No real secrets, credentials, private keys, or
real customer PII found anywhere in full history (all branches, all
commits, including deleted files). Every regex hit traced to a test
fixture, documentation prose, a local-dev-only default, a placeholder
`.env.example` value, or a false-positive pattern match (base64 PNG bytes,
email regex matching inside a URL). Safe to make public from a secret-scan
standpoint. Recommend Nate still spot-check `~/bcns/docs` and any private
Slack/Notion links referenced from README files, since this scan only
covered the three repos' own git history.
