---
# Fix Report — B2: Registry rework
**Date:** 2026-07-14
**Findings addressed:** 5 of 5 review findings (0 QA failures + 5 review findings)

## Changes Made
- `content-registry.test.mjs:49-57` — replaced `parentKey` propagation + `STRUCTURAL_KEYS` Set with path-suffix check (`path.endsWith('.href') || path.endsWith('.photo')`) inside `collectStrings`; removed now-unused `STRUCTURAL_KEYS` const — review Important
- `content.ts:168-172` + `past-work.tsx:30` + `reviews.tsx:30` — added `ctaHref: string` to `HoldingState` interface; added `[SLOT: past-work/holding-cta-href]` and `[SLOT: reviews/holding-cta-href]` in siteContent; both components now read `holdingState.ctaHref` instead of hardcoded `"/#contact"` — review Important
- `about-founder.tsx:26` — replaced `key={index}` with `key={founder.name}` on founders map — review Minor
- `past-work.tsx:39` — replaced `key={index}` with `key={workTitle}` on items map — review Minor
- `reviews.tsx:39` — replaced `key={index}` with `` key={`${author}-${company}`} `` on items map — review Minor
- `content-registry.test.mjs:71-78` — expanded `REQUIRED_KEYS` from 6 to 13 keys (added `pastWork`, `reviews`, `pricing`, `faq`, `about`, `navCards`, `pageMeta`) — review Minor
- `b2-registry-rework.test.mjs:204` — removed unused `injectedItems` variable (lint error surfaced by the above changes) — collateral lint fix

## Build Status
`pnpm lint && pnpm typecheck && pnpm build` — all green. `content-registry.test.mjs` 188/188 passed; `b2-registry-rework.test.mjs` 77/77 passed.

## Disputed
None.

## Deferred
None.
---
