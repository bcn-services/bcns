# shop/redact automation — engineering notes

Branch: `shop-redact-auto`. Full design: `docs/architecture/retention-30d-shop-redact.md`.
Step-order docs: `platform/DESIGN.md` §5.2, §5.9a.

## Design deviations from a naive implementation

- **`scope.ts` extraction**: `deleteClientRows`/`rawPartitions` were pulled out of
  `scripts/hard-delete.ts` / `scripts/export.ts` into `platform/worker/src/scope.ts` so the new
  worker task and the existing scripts share one table list and one delete path, instead of a
  second hand-maintained copy. Forced by `platform/worker/Dockerfile` only `COPY`ing
  `platform/worker` — `scripts/` isn't in that image, so the shared code has to live under
  `worker/src`, and scripts import it back (scripts run locally via tsx, so the reverse import is
  fine; the worker image never needs scripts/).
- **`ScopeOpts.source`**: source-scoped delete is additive to the existing full-wipe behavior —
  omitting `source` reproduces `hard-delete.ts`'s original unscoped loop exactly. A parameterized
  JS string bound against `data.source` (an enum column) works with no explicit cast; confirmed
  empirically by `privacy-shop-redact.test.ts` passing outright, not just inferred.
- **`shopRedact` runs before `alerts` in `tick.ts`**: `alerts()` ends by calling `sendPending()`,
  which flushes every unsent `data.notifications` row, not just the ones `alerts()` itself raised.
  Placing `shopRedact` immediately before it means a `needs_operator` escalation this step writes
  goes out by email in the same tick instead of waiting one more.
- **Escalation reuses `data.notifications` + the existing Resend path** instead of a second mailer
  — every other escalation in this worker already works this way.
- **`_shared/shopify-hmac.ts`**: uses `Uint8Array<ArrayBuffer>`-typed views (a TS 5.9 strictness
  fix) so the WebCrypto call typechecks identically under Deno and under vitest/Node — this is
  what let the Edge Function's HMAC check be tested without a Deno mock
  (`edge-shopify-shop-redact.test.ts` runs it directly, and cross-checks it against
  `apps/connect/lib/shopify-oauth.ts`'s own `verifyWebhookHmac` for parity).

## Schema/grant justification (from the migration's own comments)

`api.record_shop_redact` exists instead of a direct table grant because the Edge Function calls in
as `service_role` with no caller JWT (HMAC is its only auth), and `service_role` has zero `usage`
on `data`/`api` by design (`20260912000200_access.sql`'s blanket revoke). Widening that to a table
grant on `data.privacy_requests` would give `service_role` a foothold on `data` this migration
explicitly avoids. So: one `SECURITY DEFINER` function, pinned `search_path = ''`, `EXECUTE`
revoked from everyone then granted to `service_role` alone, plus the one `usage on schema api`
grant that's a prerequisite for `service_role` to reach it at all (schema `USAGE` alone conveys no
table/function access — Postgres refuses "permission denied for schema api" before `EXECUTE` is
even checked without it).

## Mutation testing (5/5 required, all confirmed red then reverted to green)

1. **Inverted HMAC check** (`shopify-hmac.ts`: `return safeEqual(...)` → `return !(await
   safeEqual(...))`). Red: 8/12 failed in `edge-shopify-shop-redact.test.ts`, 3/12 failed in
   `apps/connect/tests/shop-redact-forward.test.mjs`. Reverted; 12/12 green.
2. **Dropped `source` filter** in `scope.ts`'s delete loop (both branches collapsed to `delete ...
   where client_id = $1`, no source filter at all). Red: 1/7 failed in
   `privacy-shop-redact.test.ts` — the non-shopify (`monday`) row was wrongly deleted too
   (`customerCount(client, 'monday')` expected 1, got 0). Reverted; 7/7 green.
3. **Dropped `client_id` filter, kept `source`** (`where client_id = $1 and source = $2` →
   `where source = $2`). Red: 2/7 failed in `privacy-shop-redact.test.ts` (cross-client deletion
   and a knock-on idempotency-test failure). Reverted; 7/7 green.
4. **Removed the `BRIDGE_SHOP` guard** in `privacy.ts`. Red: 1/7 failed — the bridge shop fell
   into the generic "no client matches this shop" escalation instead of the bridge-specific one
   (`expected 'no client matches this shop' to match /sb-bridge/`), the exact reason-string drift
   the test is designed to catch. Reverted; 7/7 green.
5. **Removed `unique` from `webhook_id`** in the migration (`text not null unique,` → `text not
   null,`), full `supabase db reset --workdir .` before and after. Red: 2/3 failed in
   `rpc-record-shop-redact.test.ts` with Postgres error `42P10` — "there is no unique or exclusion
   constraint matching the ON CONFLICT specification" — proving the constraint is load-bearing for
   the idempotency the design claims. Reverted, reset again; 3/3 green.

All five reverts confirmed via file re-read matching the pre-mutation original.

## Full verification chain

- `corepack pnpm lint` — **pass**, all packages, no warnings introduced.
- `corepack pnpm typecheck` — **pass**, all packages.
- `corepack pnpm test` (aggregate, repo root via turbo) — **two separate findings, neither a
  regression from this branch**:
  1. `@bcn-services/tenant#test` fails on a pre-existing, unrelated assertion
     (`matcher.test.mjs`: "every app middleware inlines exactly TENANT_MATCHER") that
     `apps/connect/middleware.ts` already diverges from the canonical `TENANT_MATCHER` (extra
     webhook/oauth path exclusions). Confirmed via `git diff origin/main -- apps/connect/
     middleware.ts packages/tenant/` returning **empty** — neither file is touched by this branch,
     so the drift predates it.
  2. Running `platform`'s full 212-test suite in one process (`turbo run test` scoped to
     connect/platform/web) crashed the local Supabase Postgres container mid-run
     (`worker.test.ts`'s `lease_reap`/`timezone_renormalize_scoped`, both unrelated to this
     branch) — the container logs showed `system_memory_high_watermark` and `disk_almost_full`
     alarms, and colima here is provisioned with only 4 GiB RAM / 2 CPUs. Two subsequent
     `supabase start` attempts failed the same way. This is a local resource-exhaustion issue with
     the dev machine's colima VM, not a code defect — restarting/resizing colima is outside this
     task's scope (not part of the shop-redact deletion feature, and touches shared machine
     config).
  - **What this branch's own tests actually show** (all run individually against a healthy local
    stack earlier in this session, all green, and re-confirmed green after every mutation-test
    revert): `edge-shopify-shop-redact.test.ts` (12), `privacy-shop-redact.test.ts` (7, new),
    `rpc-record-shop-redact.test.ts` (3, new), `apps/connect/tests/shop-redact-forward.test.mjs`
    (12), plus the pre-existing `scripts.test.ts` (19, hard-delete/export, unaffected by the
    `scope.ts` refactor) — **53 tests, all passing**.
- `corepack pnpm build` — **pass**, 7/7 turbo tasks (including `@bcn-services/connect`, which
  compiles the `/api/webhooks/shopify/shop-redact` route and the updated `gdprRoute` hub cleanly).

## Logging

Every layer (hub forward, Edge Function, worker escalation/delete) logs shop + webhook id
(implicitly, the row id) + outcome only — never the payload, HMAC, or a secret. Verified by
`edge-shopify-shop-redact.test.ts`'s log-content assertion and by inspection of `privacy.ts`'s one
`t.log('shop_redact_failed', ...)` call, which logs only the row id and an error message.
