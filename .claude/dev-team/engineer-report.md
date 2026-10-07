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

## Fix pass 2 (delta review: 0C/1I/2M)
- IMPORTANT applied: `sendClientEmail` (health.ts) adds `reply_to: BCNS_ALERT_EMAIL` to each batch message when set (omitted when unset), so the stale copy's "reply to this email" reaches bcns's human alert inbox, not the bot sender. Pinned by 2 new pure tests in `platform/test/break-emails.test.ts` (stub Tick fetch: one message per owner, reply_to, Idempotency-Key, `/emails/batch`; no reply_to key when env unset; env restored in afterEach) and a `reply_to` assertion in the DB-backed `client_break_emails` case.
- MINOR applied: dropped the `case when last_error is distinct from 'no owner to email'` in `raiseClientBreaks`; plain `sent_at`. An owner added mid-breakage now still gets the reminder. DB sub-case added in `client_break_emails` (initial row set to 'no owner to email', reminder deleted, tick -> reminder raised, 3rd batch sent). CI-only: local Supabase stack is down, so that case is unrun here; typechecks.
- MINOR applied: `platform/DESIGN.md` 5.6 reworded: reminder is 3 days after the first email was sent (unsent counts nothing; a 'no owner' row's sent_at still starts the clock), and replies go to the bcns alert inbox.
- Gates: `pnpm --filter @bcn-services/platform test` 160 passed (floor 158, +2), 0 fail; platform `typecheck` clean.
- Mutations (cp backup, shasum identical after each, git status shows only the 4 intended files): reply_to spread removed -> RED "one batch message per owner, replies to the bcns alert inbox" (toMatchObject); key from clock -> RED 3 key tests; owner filter removed -> RED ownerRecipients; reminder threshold 0 -> RED "reminder: absent ... at 3d-1min" test.

## Fix pass 3 (delta2 review: 0C/1I/0M)
- IMPORTANT applied: `BCNS_ALERT_EMAIL` is the alerts inbox an automated fixer parses, so a client reply would trigger a bot. `sendClientEmail` (health.ts) now sets `reply_to` ONLY from the new optional env `BCNS_CLIENT_REPLY_TO` (a human-read inbox); unset -> no `reply_to` key. No fallback to `BCNS_ALERT_EMAIL`; `from` logic unchanged (`BCNS_ALERT_FROM || BCNS_ALERT_EMAIL`).
- Stale copy (health.ts breakEmail): "reply to this email" promise removed; now "Reconnecting usually fixes it. If it doesn't, we get the same alert and will follow up." auth_failed copy unchanged. Pure test pins the sentence and asserts no email text (both statuses, both kinds) contains "reply".
- Tests: `platform/test/break-emails.test.ts` sendClientEmail tests set/restore `BCNS_CLIENT_REPLY_TO` (ENV list); one asserts `reply_to` from it, the other asserts the key is absent when only `BCNS_ALERT_EMAIL` is set. `platform/test/worker.test.ts` client_break_emails (CI only, not run here): asserts `reply_to` absent; beforeAll deletes `BCNS_CLIENT_REPLY_TO`.
- Docs: `platform/DESIGN.md` 5.6 paragraph and `platform/docs/deploy-worker.md` job env table document `BCNS_CLIENT_REPLY_TO` (optional; unset -> replies go to the from address). `platform/scripts/gcp-setup.sh` NOT touched (job env is create-time only): Nate sets it with a one-off `gcloud run jobs update bcns-data-worker --update-env-vars BCNS_CLIENT_REPLY_TO=<inbox>` (line is in the PR body).
- Gates: `pnpm --filter @bcn-services/platform test` 160 passed (floor 160, 16 files, 0 fail); platform `typecheck` exit 0.
- Mutation: health.ts `replyTo = envStr('BCNS_CLIENT_REPLY_TO') || envStr('BCNS_ALERT_EMAIL')` -> RED, exactly 1 failure: "sendClientEmail > only BCNS_ALERT_EMAIL set: no reply_to key at all (never the alerts inbox)" (159 pass / 1 fail). Restored from cp backup, shasum -c OK, cmp identical, git status shows only the 5 intended files.
