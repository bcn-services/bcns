BUILT — polish/connect — f084396 (uncommitted working tree) — self-check: cd apps/connect && pnpm test pass
# Engineer Fix Report (round 1)
Findings addressed: 3 of 3 (0 QA, 1 Important + 2 Minor review). Test count 386, 386 pass, 0 fail. Root `pnpm typecheck` and `pnpm lint` green.
- apps/connect/lib/first-run.ts:62-69 — syncDone = hub health row with last_success_at only; sourceDone = syncDone || connected card; visible adds `&& !(aiDone && teamDone)`; comments rewritten (AI timestamp comes from mcp_tool_calls: failed calls, survives redact) — review Important
- apps/connect/lib/first-run.ts:46 — FirstRun.visible doc comment notes ai + team done also hides it — review Important
- apps/connect/tests/first-run.test.mjs — "monotonic" test renamed, asked.source/sync now false (asked.ai true); disconnect test now asserts ticks {source:false,sync:false,team:true,ai:true} and visible false (its old `allDone === true` is no longer true by design) — review Important
- apps/connect/lib/data-stats.ts:54-56 — quickbooks/expenses dropped from defaultPins; comment says why — review Minor
- apps/connect/tests/data.test.mjs:546,551 — title and assertion: defaultPins(["quickbooks"]) is [] — review Minor
- apps/connect/app/access/copy-url.tsx:21 — aria-label "Copied workspace address" / "Copy address of this workspace" (contains visible text) — review Minor
- Mutation check: removed `&& !(aiDone && teamDone)` in a cp backup; "a completed checklist stays hidden after the owner disconnects the only source" failed (385/1); restored, `shasum -c` OK, 386/0.
Disputed: none. Deferred: none.
Flag: owner with ai + team ticked but no source ever connected (e.g. failed AI calls + an invitee) now has the checklist hidden; follows the prescribed rule, not a regression vs base for finished checklists.
Files outside apps/connect touched: none (only this report). Not committed, per instruction.
