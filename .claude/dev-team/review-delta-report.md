REVIEW: 0C/0I/1M
# Review Delta Report (fix round 1, 77e9bd7..56045f2)
**Date:** 2026-10-08
**Files Reviewed:** 3 (apps/web/lib/content.ts, apps/web/CONTENT.md, docs/architecture/platform-v1.md)

## Prior findings
- I1 monday "nothing to revoke": closed. content.ts:1092 matches disconnect.ts:45-46 ('none') and the hub copy at lib/sources.ts:274-277.
- I2 owner-only: closed. "Your account owner" matches RPC BCNS2 (20261007000500:19-21), route ownerSession, and canDisconnect.
- I3 person-handled line: closed. Both disconnect strings now come after content.ts:1090, so "These requests" covers only the email and Shopify/Meta requests above it.
- M1 Google different account: closed. "if they use the same Google account" matches googleRevokeNeeded per client (disconnect.ts:96-101,135-147). Data deletion is still unconditional (disconnect.ts:149-157), and the copy does not say otherwise.
- M2 dangling "It deliberately": closed (content.ts:996).
- M3 platform-v1 /signup: closed. Each clause checks out: /signup is a 404 with the flag off (signup/page.tsx:16), the server action calls the Edge Function (signup/actions.ts:15-22), "Create account" is flag-gated (login/page.tsx:105-109), and the only mailto in login/page.tsx is in the finishingShopify branch (:50, :63-71). The engineer's departure from my suggested wording is correct.

## Findings

### Minor
Minor — docs/architecture/platform-v1.md:212-216 — the bullet grew from a one-clause fix into a four-clause parenthetical, which goes against the lane rule that a deletion beats a rewrite. The trailing clause "there is no "Create account" link, and only the Shopify-install finish variant of the page shows a mailto to bcns" is true but repeats the flag-gating already stated. — Fix (optional): delete that trailing clause, so it reads "...calls the public `signup` Edge Function; with the flag off, `/signup` is a 404)."

## Other checks
- content.ts:1091-1092: every clause checks out against disconnect.ts and lib/sources.ts. The only thing this round changed in that copy is the wording ("cancel" for "revoke"), and the new monday line is the hub's own advice.
- CONTENT.md:1090 mirrors content.ts: owner-only, placed last, Intuit/Meta/Google, the same-account caveat, and monday removed by the owner. No field was added.
- The working tree is clean against 56045f2. Only the 3 allowed files changed under apps/docs.
- I did not re-run the gates; I accepted the orchestrator's re-run (106/94/0/12, docs 21/21).

## STANDARDS.md Updates
none (scoped re-review)
