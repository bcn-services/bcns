# Progress

> Pre-run ledger for the business-model migration (PLAN.md). dev-team-auto updates
> each row in place as items resolve (`done [track] — summary — commit` or
> `blocked — VERDICT: FAIL — …`). Rows are in PLAN.md order. Items below the
> `⚠️ AUTONOMOUS RUN — STOP HERE` marker are not part of this run.

| Item | Status |
|------|--------|
| W1 — Reshape pricing registry + page to setup + recurring + seats | done [full] — pricing reshaped to setup ($1,000/$3,000) + monthly ($149/$349) + 15-user/$20-overage; consulting $800/day kept; FAQ rewritten; old ranges removed; QA PASS + clean review; commit a05059f |
| W2 — Replace false ownership / "runs without us" claims with hosted framing | done [full] — hero→"We host it and keep it running", contact reframed (data yours + export on request), process→"Build & launch"; "Use it forever, free" + "whether we work together or not" removed; QA PASS + review 1 Important fixed; commit 8f96916 |
| W3 — Add "how hosting works" explanation (recurring covers / stop-paying) | done [light] — 3 FAQ entries: monthly-fee coverage (hosting/backups/bug fixes/own-servers), BYO-Anthropic-key AI optional, stop-paying (hosting stops + data exported); QA PASS; commit acd3259 |
| W4 — Mirror all copy changes into CONTENT.md | done [light] — CONTENT.md mirrors content.ts 1:1 (setup/monthly/seats + 3 hosting FAQs + cross-check 77→80); QA verified both-direction completeness; commit 2e5cbde |
| A1 — `@bcns/app-core`: billing math, subscription state, BYOK-AI | done [full] — new package: cents-as-source-of-truth PRICING (deep-frozen) + formatUsd, monthlyCharge breakdown, decideAccess, DI-mockable BYOK Anthropic (claude-haiku-4-5); 54 tests; QA PASS + review 1 Important (freeze) fixed; commit 99b0b94 |
| A2 — Scaffold `templates/hosted-web/` starter wired to `@bcns/app-core` | not started |
| A3 — Architecture decision record for the hosted-web model | not started |
| A4 — Update repo docs to the per-client-repo model | not started |
