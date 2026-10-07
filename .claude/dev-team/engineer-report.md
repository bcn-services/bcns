# Engineer Report
**Task:** item 4 — client break emails (platform/worker/src/health.ts)
**Branch:** feat/break-emails
**Date:** 2026-10-06

## Design Decisions
- Pure layer exported: `clientBreakNotices`, `breakKey`, `ownerRecipients`, `breakEmail`; DB/IO: `ownerEmails(clientId)`, `sendClientEmail(t,to,subject,text,idemKey)` (item 5 reuses these two).
- Key built from `status_since.toISOString()` (never the clock); reminder only when the client_break row's created_at <= now-3d.
- Deviation: initial_created_at is fetched with a second query by computed key (keys built once in JS) instead of a SQL left join; same semantics, avoids duplicating the key format in SQL.
- `alerts()` return now includes client rows raised (count only); bcns SQL and bcns send branch unchanged.
- sendClientEmail: one `/emails/batch` call, one message per owner, `Idempotency-Key` = dedupe_key; no owner -> sent_at + last_error 'no owner to email'.
- Reconnect link = hub home constant; labels map mirrors hub.

## Files Changed
- `platform/worker/src/health.ts` — new client-break step, helpers, sendPending routing.
- `platform/test/break-emails.test.ts` — 12 pure tests (no ./helpers import, runs locally).
- `platform/test/worker.test.ts` — DB-backed `client_break_emails` case (CI only; not run locally).
- `platform/DESIGN.md` — notifications kinds + §5.6 client break paragraph.

## Deferred / Out of Scope
- DB-backed case unrun locally (stack must stay down); verified by typecheck only.

## Flags for Reviewer
- sendPending: ownerEmails runs one query per pending client row (limit 50/tick).
- No Resend response-body check beyond HTTP ok on batch.
- Mutations (pure layer, `/tmp` backup, shasum a78140b28594089745f01ef97fb42a5cc5e525fe restored, clean status):
  health.ts:122 key+now -> RED "auth_failed is immediate..." / "same breakage at two clocks..." / "two ticks ... one row"; health.ts:158 drop owner filter -> RED "ownerRecipients keeps owner..."; health.ts:125 threshold 0 -> RED "reminder: absent ... 3d-1min".

## Fix pass
- M1 health.ts breakEmail: stale copy now "Reconnecting usually fixes it. If it doesn't, reply to this email and we'll sort it out."; auth_failed unchanged; pure test pins the difference.
- M3 health.ts: BreakRow.initial_created_at -> initial_sent_at; reminder measured from sent_at, null when 'no owner to email'. Deviation: gate is `last_error is distinct from 'no owner to email'`, not `last_error is null`, because a retried-then-sent row keeps its earlier last_error and would wrongly lose its reminder.
- M5 worker.test.ts: gamma (paused) health set auth_failed, asserts no client_break row; gamma health restored in finally; DB test backdates sent_at too (CI only, not run locally).
- Mutations (shasum 28de312948c21773d1a93cc57024ead17efbe777 restored): health.ts:125 threshold >= 0 -> RED 'reminder: absent with no sent initial...'; sent gate dropped (initial_sent_at ?? status_since) -> RED same test.
- Skipped M2, M4 per instruction (follow-ups).
