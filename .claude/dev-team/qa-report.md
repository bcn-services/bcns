---
# QA Report
**Task:** A4 — Legal pages + config scaffolding
**Branch:** worktree-experimental-overnight-first-draft
**Date:** 2026-07-14
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- `pnpm lint && pnpm typecheck && pnpm build` green — all three commands clean, 0 errors — PASS
- `/privacy` and `/terms` appear in Next.js build table — both listed as `○` static pages; `.html`/`.rsc`/`.meta` files confirmed in `.next/server/app/` — PASS
- Both pages render with labeled slots, no real legal text — `[PRIVACY POLICY BODY:…]` and `[TERMS OF SERVICE BODY:…]` present in source and in built `.html` output — PASS
- Footer links point to `/privacy` and `/terms` (not `#`) — `href: "/privacy"` and `href: "/terms"` in `legalLinks`; no `#` for those entries — PASS
- `sitemap.ts` includes both routes with `siteConfig.url` base — `` `${siteConfig.url}/privacy` `` and `` `${siteConfig.url}/terms` `` confirmed — PASS
- `site.ts` has `name: "bcns"` and `domain`/`email`/`url` as placeholder constants with TODO comments — all fields present, three TODO comments confirmed — PASS

## Tests Added
- `apps/web/__tests__/a4-legal-pages.test.mjs` — 21 assertions across all 6 criteria; runs via `npx tsx`. No new infra created (reused existing tsx-based pattern from A2).

## Not Verifiable
- none
---
