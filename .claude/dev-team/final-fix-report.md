# Fix Report
**Date:** 2026-10-08
**Findings addressed:** 3 of 3 (0 QA failures + 3 review findings)

## Changes Made
- apps/web/lib/content.ts:1091 + apps/web/CONTENT.md:1090 — Google clause reworded: cancel with Intuit or Meta, and with Google once Drive and meeting notes are both disconnected; different Google accounts means also remove bcns from the first account's Google settings — review Important
- platform/worker/src/health.ts:322 — sendClientEmail returns `already_sent` only for a 409 whose body `name` (JSON, else substring of text) is `invalid_idempotent_request`; any other 409 throws like other non-ok statuses; comment updated — review Minor
- platform/DESIGN.md:1158 — clause now states the same split — review Minor
- platform/test/break-emails.test.ts — existing 409 test sends the invalid_idempotent_request body; new test: 409 concurrent_idempotent_requests throws — review Minor
- platform/test/break-emails.test.ts — new `sendPending` describe: (a) 409 invalid_idempotent_request updates row with sent_at=now() and last_error 'resend 409: idempotency key already used'; (b) 200 updates with last_error null. Uses a file-level `vi.mock('../worker/src/db.js')` (importOriginal spread, sql stubbed) as in empty-full-list.test.ts; no health.ts restructure — review Minor

## Disputed
none

## Deferred
- first-run.ts:77 Minor (no fix recommended by the review)

## Gates
- apps/web `pnpm test`: 106 tests, 0 fail
- platform `vitest run`: 22 files, 257 tests, 0 fail (DB files skipped locally)
- `pnpm test:docs`: 21/21; `pnpm typecheck`: 11/11 tasks green
- Mutation (every 409 returns already_sent): new concurrent test went red (1 failed, 18 passed); restored, 19/19
