BUILT — feat/mcp-directory — b10e653 — self-check: pnpm --filter @bcn-services/platform test pass
GATES mcp: 272 -> 273 pass (tsc clean); new tests/titles.test.mjs
GATES platform: 15 files/146 tests -> 16 files/158 tests, all pass (20 DB files skipped locally, no stack); typecheck clean
GATES web: 98 -> 106 total; pass 87 -> 94, skip 11 -> 12, fail 0 (with a .next build: 106/106 pass); typecheck + lint clean
MUTATION 1: removed one TOOL_TITLES entry in apps/mcp/src/policy.ts -> mcp suite red (titles.test.mjs + mcpTools() throws "has no human title"); restored via cp, shasum identical
MUTATION 2: `if (!values.apply)` -> `if (false)` in seed-demo-tenant.ts -> red: "the --apply guard > dry run (no flag) issues zero queries, opens no connection and prints the plan" (1 failed/11 passed); restored via cp, shasum 3c52b090... identical, clean git status
MCP: McpTool.annotations now `{ title, ...TOOL_ANNOTATIONS }`; mcpTools() throws if title missing or equals tool name (no silent fallback); readOnlyHint true / destructiveHint false asserted; policy/query tests updated for title
WEB route: /services/connect/setup (apps/web/app/services/connect/setup/page.tsx); placed under /services/connect because it is the product page's how-to, teaser added after ConnectFaq; sitemap entry added
WEB content: copy in lib/content.ts connectSetup + pageMeta, mirrored in CONTENT.md (30 new rows, total 152); ChatGPT plan language hedged; "$200/month, no setup fee"; privacy link /privacy; no jargon (test-enforced)
SUPPORT contact: info address from siteConfig.email (same one used in site footer/legal), "a person will help you set it up"; no new inbox invented
WEB tests: __tests__/connect-setup.test.mjs (fields, URL/support/privacy, jargon ban, wiring, CONTENT.md mirror + total re-derivation, built-HTML check skips without build)
SEED file: platform/scripts/seed-demo-tenant.ts; test platform/test/seed-demo-tenant.test.ts (12 tests, does not import ./helpers so it runs without the stack)
SEED tables covered: clients, money (orders/refunds/payouts, 291), customers (36), products (8), daily_metrics (1086), jobs (12), messages (6), records (9), ai_settings (customer contact sharing on), reviewer membership + auth user
SEED tables skipped: media/media_sets (needs storage objects), connector_* / source_tokens (no secrets, no live connectors for a demo), egress_ledger, raw_*
SEED safety: dry-run by default (no DB connection opened); refuses slug whose data.clients.notes is not the demo marker; all emails @example.com, no phones, URLs only https://example.com; idempotent upserts on natural keys; password printed once, never stored
SEED verified: ran main --apply twice against a throwaway local Postgres 17 (all repo migrations applied, stub auth schema, NOT supabase start, NOT a real DB): counts identical both runs (money 291 customers 36 products 8 daily_metrics 1086 jobs 12 messages 6 records 9 ai_settings 1 memberships 1, 1 auth user); non-demo slug refused with zero rows written; scratch cluster deleted
SEED not verified: real Supabase auth.admin.createUser path (faked in tests/scratch); MCP views against seeded data under a real JWT
DEP none added
FLAG seed dry-run base date derives from today (UTC); pass --base-date to pin
FLAG apply path makes two connections (data write, then membership); data write is one transaction, membership step is separate
NATE-ONLY 1: dry run (safe): cd platform && pnpm tsx scripts/seed-demo-tenant.ts
NATE-ONLY 2: write to prod: cd platform && DATABASE_URL=<prod session pooler> SUPABASE_URL=<prod url> SUPABASE_SERVICE_ROLE_KEY=<from keychain> pnpm tsx scripts/seed-demo-tenant.ts --apply   (save the printed reviewer password; --reset-password issues a new one)
NATE-ONLY 3: submit to Claude directory: free route = the directory review/submission form with the connector URL https://mcp.bcn-services.com/mcp, setup page https://bcn-services.com/services/connect/setup, privacy /privacy, reviewer login from step 2; admin-portal route may need a paid Team/Enterprise org
NATE-ONLY 4: submit to ChatGPT directory with the same URLs and reviewer login; check the current plan requirements for custom connectors first
NATE-ONLY 5: ! GITHUB_TOKEN= gh pr ready <n> -R bcn-services/bcns ; ! GITHUB_TOKEN= gh pr edit <n> -R bcn-services/bcns --body-file <file> ; ! GITHUB_TOKEN= gh pr merge <n> --squash -R bcn-services/bcns
COMMITS 262a49d feat(mcp) title; 581b53f feat(web) setup page; b10e653 feat seed script; (not pushed)
