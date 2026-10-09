BUILT — polish/connect — 2ab399e (uncommitted) — self-check: cd apps/connect && pnpm test pass (387/387)
- apps/connect/lib/first-run.ts:76 — visible now `role === "owner" && !allDone && !(aiDone && teamDone && !sourceDone)`; comment rewritten: hides only when ai + team done and no source connected; connected-but-unsynced source stays visible — review-delta Important.
- apps/connect/tests/first-run.test.mjs — +1 test (owner, AI used, non-smoke member, shopify never_ran row): steps {source:true, sync:false, team:true, ai:true}, visible === true.
- Mutation (cp backup, revert clause to `!(aiDone && teamDone)`): 387 tests, 386 pass, 1 fail = the new test; restored, shasum matches (43b81eab...).
- After fix: apps/connect pnpm test 387 tests / 387 pass / 0 fail (was 386); root pnpm typecheck 11/11 and pnpm lint 10/10 tasks successful.
- Existing "completed checklist stays hidden after disconnect" test still green; only the two files above changed (plus this report); not committed.
