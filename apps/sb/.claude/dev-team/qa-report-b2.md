# QA Report — Daily Briefing (chunk 4 B2)

**Branch:** feat/daily-briefing (HEAD ae1e6cb, includes QA test commit on top of b124408)
**Diff base:** feat/daily-financial-report
**Date:** 2026-09-14

## VERDICT: PASS

## Scope

Read-only review of the diff (b124408 vs feat/daily-financial-report):
`lib/briefing.ts`, `lib/env.ts`, `app/actions.ts`, `scripts/briefing.ts`,
`app/page.tsx`, `tests/briefing.test.mjs`. No branch switch, no commit of
code under test, no push, `.env.local`/`.env.production` not read. Used
`corepack pnpm` throughout. No real API key anywhere — all tests use a fake
`BriefingAi` and a fake `DataClient`. No new dependencies added.

## Spec Verification

- **`runBriefing` — yesterday = client-local day, one Messages call, no tool loop, no direct SDK import.** `lib/briefing.ts:283` computes `day = yesterdayInTimezone(timezone, now)`; the model call at `lib/briefing.ts:301-306` passes no `tools` param (asserted directly: `tests/briefing.test.mjs:301` `assert.equal("tools" in params, false)`); `BriefingAi` is a structural interface (`lib/briefing.ts:230-241`) built by `lib/ai.ts`'s `maybeGetAiClient`, and grep confirms no `@anthropic-ai/sdk` import in `lib/briefing.ts`. PASS.
- **Payload = B1 numbers + the four view rows, no PII.** `buildPayload` (`lib/briefing.ts:198-218`) hand-picks fields by name for every row type — no `id`, `owner`, `participants`, message body, `detail`, or `url` ever touches the object. Verified by existing `tests/briefing.test.mjs:309` (payload carries no ids/PII) and `:343` (the view reads themselves never select those columns). PASS.
- **`briefing` / `briefing_run` persistence.** `external_id` `briefing:<day>` at `lib/briefing.ts:337`; one `briefing_run` per call with a fresh UUID (`crypto.randomUUID()`, `lib/briefing.ts:315`) and body `{input_tokens, output_tokens, usd}` (`lib/briefing.ts:320`). Verified by `tests/briefing.test.mjs:246` and `:261` (each call gets its own id). PASS.
- **`AI_MONTHLY_BUDGET_USD` cap.** `readPositiveNumber` in `lib/env.ts:24-27` treats non-positive/NaN/string as unset; `aiGate` (`lib/briefing.ts:78-83`) returns `cap_unset` when undefined; spend is `monthSpendUsd` — sum of this client-local month's `briefing_run` usd (`lib/briefing.ts:113-117`); `capReached` is `spentUsd >= capUsd` (`lib/briefing.ts:88-90`). PASS — see mutation check below.
- **Degrade to B1 + one-line note.** `SKIP_NOTES` (`lib/briefing.ts:53-61`) covers `ai_off`, `key_missing`, `cap_unset`, `cap_reached`; `scripts/briefing.ts` always prints the Daily Financial Report first, then appends the note or the briefing (`scripts/briefing.ts:33-41`); `app/page.tsx`'s panel renders the stored briefing regardless of the flash code (loads via `loadStoredBriefing`, independent of the current gate state). PASS.
- **On-demand rate limit, cron exempt.** `generateBriefingNow` (`app/actions.ts`) calls `runBriefing({..., onDemand: true})`; `isRateLimited` gates only when `deps.onDemand` (`lib/briefing.ts:296`); the cron script (`scripts/briefing.ts:39`) calls `runBriefing` without `onDemand`. PASS.
- **Required test cases exist.** cap reached/unset, rate limit (10-min blocked, 15-min allowed, cron exempt), AI off, key missing, token→usd, empty data — all present in `tests/briefing.test.mjs` (see line refs in that file's test names). PASS.

## Edge Cases Probed (beyond the existing 30 tests)

Added `tests/qa-briefing.test.mjs` (11 new tests, appended to `package.json`'s `test` script):

- Month-boundary math at extreme UTC offsets: UTC+14 (`Pacific/Kiritimati`) and UTC-12 (`Etc/GMT+12`), both as a pure `monthSpendUsd` check and through the full `runBriefing` flow — confirms the client-local month, not the UTC calendar date, gates the cap even at offset extremes far past the ±1-day slack window `loadSpend` uses.
- Clock skew: a future `occurred_at` (server clock skew) is documented as still counting inside the 15-minute rate-limit window (`isRateLimited` has no floor on negative deltas) — see Findings.
- A future-but-same-local-month `occurred_at` still counts toward spend (no special-casing, as expected).
- Big numbers: `runUsd` holds a $999,999.99 cost without precision loss; `tokensToUsd` at 1B input/output tokens stays finite and exact.
- Float drift: a sum of `4.7 + 0.1 + 0.1 + 0.1` (`4.999999999999999` in IEEE754) still correctly reads as under a `$5` cap.
- Payload boundary filtering at UTC+14: a job updated 1 minute before local midnight is excluded from the payload; one at local midnight is included — pins `buildPayload`'s per-row `inLocalDay` check at an offset where day math is easy to get backwards.
- `buildPayload` drops campaign rows for neighboring days even when present in the rows array (defense-in-depth behind the DB-side `.eq("day", day)` filter).
- A boundary-semantics regression pin for `capReached` (`>=`) and `isRateLimited` (`<`).

All 11 new tests pass; full suite (`tests/briefing.test.mjs` + `tests/qa-briefing.test.mjs`) is 41/41 green.

## Mutation Check

- `capReached`: flipped `>=` to `>` in `lib/briefing.ts` → 3 tests failed (as expected) → reverted.
- `isRateLimited`: flipped `<` to `<=` in `lib/briefing.ts` → 2 tests failed (as expected) → reverted.
- `git diff lib/` confirmed empty after both mutations were reverted.

## Test Runs

- `corepack pnpm typecheck` — clean (only a pre-existing, unrelated pnpm `.npmrc` auth-token warning on every command).
- `corepack pnpm lint` — clean.
- `corepack pnpm test` — 237 tests, 236 pass, 1 skipped (`rls: anon key cannot read arbitrary tables without a policy` — skips itself when Supabase env isn't configured; pre-existing, unrelated to this item, not run since `.env.local`/`.env.production` were not read per instructions).

No build or dev server was run, per instructions (this item is a server action + cron script + pure-function panel data; no route/model/migration/serialization surface that needed a live smoke pass beyond what the mocked suite already exercises).

## Findings

- `lib/briefing.ts:82` (`isRateLimited`) — **not a bug, documented behavior**: a `briefing_run.occurred_at` set in the future (clock skew, or a manually-edited row) makes `now.getTime() - t` negative, which is always `< RATE_LIMIT_MS`, so the on-demand button stays rate-limited indefinitely until real time catches up to the skewed timestamp. Since `occurred_at` is always `now.toISOString()` from the same process that just ran (`lib/briefing.ts:318`), this only bites on real server clock skew, not app logic — flagging for awareness, no fix requested.

## Not Verifiable

- Browser QA / live smoke: out of scope — gate mode was `tests` only (default), not `tests+behavioral`.
- `.env.local` / `.env.production` were not read (per instructions), so no live-environment-specific config (e.g. this deployment's actual `AI_MONTHLY_BUDGET_USD`) was checked — irrelevant to correctness of the gating logic itself, which is fully exercised via fakes.
