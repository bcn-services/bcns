BUILT — chore/docs-cleanup — c9b585b — self-check: pnpm test:docs pass (21/21)
Task: item 6 docs cleanup (docs/comment only). Date 2026-10-06.
PR truth verified: `gh pr list -R bcn-services/bcns --state all --limit 40` matched the brief exactly (#99,98,91,96,97,92,90,94 MERGED; #93,#95 CLOSED; #106 OPEN).
Premise check: `HUB_SOURCES` = 6 entries; `platform/worker/src/connectors/index.ts` `Source` type and `connectors` registry = shopify, meta, monday, meet, drive, quickbooks, so "exports exactly these" is still true; only "five" fixed.
Premise check: enum add in `20261001000100_client_status_pending.sql`; `platform/worker/src/health.ts:17` joins `c.status = 'active'` (so pending is skipped like paused/churned).
Lines changed:
- docs/architecture/platform-v1.md:170 "Open PR `docs/v1-layout-chunk8` (unmerged) covers" -> "PR #92 ... (merged) covered"
- docs/architecture/platform-v1.md:229 lever list `active/paused/churned` -> `pending/active/paused/churned` with one-line meaning of pending vs paused
- docs/architecture/platform-v1.md:242 "New workspaces start `paused` (an existing status value)" -> "start `pending` (a new status value, added by 20261001000100_client_status_pending.sql)"
- docs/architecture/platform-v1.md:261 `fix/worker-revoked-guard` "(open PR, unmerged)" -> "was written ... (PR #98, merged)"
- docs/architecture/platform-v1.md:281 "open PR `fix/sb-audit-bugs`" -> "PR #97 `fix/sb-audit-bugs` (merged)"
- docs/architecture/platform-v1.md:283-288 heading "(PRs open, unmerged)" + "Nothing below is merged, deployed or db-pushed" + open/draft lists -> heading "(PR status checked 2026-10-06)", merged/closed/open lists with numbers; deploy/db-push claim dropped (unverifiable)
- apps/connect/lib/sources.ts:15 "The five sources" -> "The six sources" (comment only)
- platform/DESIGN.md:67 enum bootstrap line: appended comment noting `pending` added by migration 20261001000100
- platform/DESIGN.md:1124 "Paused/churned clients" -> "Pending/paused/churned clients ... (it joins only `clients.status = 'active'`)"
- platform/NOTES.md:76 "(§5.5 skips paused/churned)" -> "(§5.5 skips pending/paused/churned)"
Sweep (git grep -n -I -i -E, pathspec: README.md apps/web/CONTENT.md docs platform/DESIGN.md platform/NOTES.md '*CLAUDE.md' 'apps/connect/**/*.md'; baselines excluded for the paused grep):
- A `(five|5) (sources|connectors)|five connector|five cards`: 1 hit (+ sources.ts, fixed). Hit: docs/architecture/declan-call-window.md:194 = dated 2026-09-21 client-call prompt about SB's five sources; historical, left.
- B `start(s|ing)? (as )?.?paused|paused.{0,60}pending|pending.{0,60}paused|active ?/ ?paused|new (account|workspace)s?.{0,40}paused`: 1 hit (platform-v1.md:242), fixed. (Pre-edit the `active / paused / churned` lever at :229 was a 2nd hit across a line break, fixed.)
- C `open PR|unmerged|<10 branch names>` outside platform-v1.md: 0 hits. Inside platform-v1.md: 5 echoes (lines 170, 261, 281, 283, 285/287), all fixed.
- `-w paused|churned` review: platform/DESIGN.md:1253/1261 (seed client gamma paused; true), :1204 etc. churned; legal-pages-research/w6a churned; docs/architecture/baselines/** frozen 2026-09-15 type snapshots (left). No other stale echoes.
- apps/web/CONTENT.md, content.ts, README.md, CLAUDE.md files, apps/connect/**/*.md: no echoes, untouched.
Checks:
- `pnpm test:docs`: tests 21 pass 21 fail 0 skipped 0. No docs test references platform-v1/DESIGN/NOTES (grep), so none assert on changed text.
- `pnpm --filter @bcn-services/connect test`: tests 314 pass 314 fail 0 skipped 0 (floor met).
- `pnpm --filter @bcn-services/connect typecheck` (tsc --noEmit): clean, no output.
Deferred / out of scope: platform-v1.md:70 "Actions minutes exhausted until 2026-10-01" and other dated claims not in item scope; not touched. Pre-existing stale items go to follow-up list, none fixed.
Flags for reviewer: DESIGN.md:67 is the bootstrap enum DDL in a spec; edit is a trailing SQL comment only (not executed anywhere; verify nothing parses that block: tests green).
