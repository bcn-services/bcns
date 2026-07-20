# Engineer Report
**Task:** W3 — Add a "how hosting works" explanation (managed-hosting model) to the content registry
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Delivered entirely via **new `faq.items` entries** (no new interfaces, no JSX, no pricing tier). `/pricing` renders `<Faq/>`, so FAQ copy satisfies AC1 (monthly-fee explanation on the pricing page) — lowest-risk `light`-track path.
- **Appended** 3 items (indices 4–6); existing indices 0–3 untouched, so b3's `faq.items[0]` assertion and all index-based checks stay green.
- Stayed consistent with W1 (setup+monthly+seats) and W2 (hosted/managed, truthful): no unbuilt features stated as present-tense guarantees; AI framed as optional/opt-in.
- No component changes: copy lives only in the registry (single source of truth); components already `.map()` `faq.items`.

## Files Changed
- `apps/web/lib/content.ts` — appended 3 `faq.items` entries (monthly-fee coverage, bring-your-own-Anthropic-key, stop-paying handoff).

## New registry entries added (W4 must mirror in CONTENT.md)
- `siteContent.faq.items[4]` — Q: "What does the monthly fee cover?" (hosting, uptime, daily backups, security patches, bug fixes, small tweaks; runs on our servers, any device).
- `siteContent.faq.items[5]` — Q: "Does my tool use AI, and how does that get billed?" (AI optional; client brings own Anthropic key; Anthropic bills directly; can omit).
- `siteContent.faq.items[6]` — Q: "What happens if I stop paying the monthly fee?" (hosting stops/offline; data exported and handed over; data always theirs).

## Verification
- Python check: new copy is em-dash-free, en-dash-free, buzzword-free (no SaaS / "we help").
- `apps/web`: lint + typecheck + build all green.
- Tests: gating files a4, b1, b3, b4 PASS; 4 pre-existing failures unchanged (25 total / 21 pass / 4 fail).
- Rendered `pricing.html` confirmed to contain AC1 (hosting/backups/bug fixes), AC2 (Anthropic key + AI optional), AC3 (hosting stops + data exported).

## Deferred / Out of Scope
- `apps/web/CONTENT.md` NOT touched — W4 mirrors the 3 new fields above (b4 will need those Q-strings present).
- No pricing-page JSX block added; a FAQ entry already satisfies AC1, avoiding new interfaces/components.

## Flags for Reviewer
- None structural — content-only, additive. Confirm the 3 appended FAQ items read at 3rd–8th grade and stay truthful about the managed-hosting model.
