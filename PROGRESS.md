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
| W4 — Mirror all copy changes into CONTENT.md | not started |
| A1 — `@bcns/app-core`: billing math, subscription state, BYOK-AI | not started |
| A2 — Scaffold `templates/hosted-web/` starter wired to `@bcns/app-core` | not started |
| A3 — Architecture decision record for the hosted-web model | not started |
| A4 — Update repo docs to the per-client-repo model | not started |
