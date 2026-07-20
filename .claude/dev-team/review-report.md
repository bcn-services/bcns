# Review Report
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Files Reviewed:** 2 (apps/web/lib/content.ts, apps/web/__tests__/w2-hosted-framing.test.mjs)
**Standards Applied:** completeness of reframe, truthfulness, voice/guardrails, W1 consistency, test quality

## Summary
The reframe is complete and internally consistent: every registry claim that previously implied the client owns the code, keeps the software after non-payment, or receives a one-time handoff has been corrected to the managed-hosting model, and no contradicting survivor remains. One Important truthfulness issue: the new contact copy promises data export as a present-tense guarantee, but no export capability exists (static marketing site, no app/backend). No Critical findings.

## Findings

### Important
- Important — apps/web/lib/content.ts:278 — truthfulness/over-claim — "you can export it any time" is a present-tense guarantee of an unbuilt capability (no "export" feature anywhere in repo; grep confirms this is the only export mention) — reword as intent/service, e.g. "your data is always yours to take with you" or "we'll export it for you whenever you ask", promising ownership without asserting a self-serve feature that isn't built.

### Minor
- Minor — apps/web/lib/content.ts:353 — term consistency — "Plain-English handoff notes" survives the "handoff" sweep; truthful here (AI consulting delivers notes, not running software) but "handoff" now conflicts with the site-wide "we host/run/maintain" reframe — optional: rename to "Plain-English setup notes"; leave if term drift is acceptable.

## Non-findings (checked, cleared)
- "one-time setup" (L318/L333/L367) — consistent with W1 setup-fee-plus-monthly recurring model, not a one-time-handoff claim.
- "Brandon owns scoping" (L405) — owns a responsibility, not the code; truthful.
- "your business runs" (L210/L269/L337) — describes the client's operation, not software running unpaid.
- howItWorks[2] "Build & launch" (L222), hero.proofPoints[1] (L196), highlights[2] "Your data" (L277), founder bio "after launch" (L396) — all correctly hosted-framed.
- Voice: no em-dash, no "SaaS", no "we help", no buzzwords in changed copy; sentences short/plain.

## Test quality
Solid, not hollow: asserts registry values (hero.proofPoints, contactSection.highlights, howItWorks.items[2]) AND source-string absences (removed phrases, em-dash, SaaS, "we help"). Gap: test #4 accepts the L278 export promise as-is, so it will not catch the over-claim above — if L278 is reworded to drop literal "export", update the test's `/export/` regex in lockstep.

## STANDARDS.md Updates
none (voice conventions already in baseline.md; no new project-specific efficiency/reliability pattern observed).
