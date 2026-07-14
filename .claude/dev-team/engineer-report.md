---
# Engineer Report
**Task:** A4 — Legal pages + config scaffolding
**Branch:** worktree-experimental-overnight-first-draft
**Date:** 2026-07-14

## Design Decisions
- No new architecture boundaries needed; legal pages are pure static Next.js App Router pages — no data fetching, no new API surface
- Pages import `siteConfig` from `@/lib/site` for the `name` field only — keeps pages decoupled from any future config splits
- Sitemap entries use `changeFrequency: "yearly"` and `priority: 0.3` — appropriate for rarely-updated legal stub pages
- No new dependencies; `@bcns/ui` Container and Next.js `Metadata` type already available

## Files Changed
- `apps/web/app/privacy/page.tsx` — new: static page with labeled slot `[PRIVACY POLICY BODY: …]` and `title: "Privacy Policy"` metadata
- `apps/web/app/terms/page.tsx` — new: static page with labeled slot `[TERMS OF SERVICE BODY: …]` and `title: "Terms of Service"` metadata
- `apps/web/app/sitemap.ts` — added `/privacy` and `/terms` entries with `changeFrequency: "yearly"`, `priority: 0.3`
- `apps/web/components/site-footer.tsx` — updated `legalLinks` Privacy and Terms hrefs from `"#"` to `"/privacy"` and `"/terms"`; removed stale TODO comment

## Deferred / Out of Scope
- Real legal text — intentionally omitted; slots are clearly labeled for manual replacement before launch
- `siteConfig.name` was already `"bcns"` and `domain`/`email`/`url` already had TODO comments — confirmed correct, no changes made

## Flags for Reviewer
- None — all pages are fully static with no runtime data fetching or external dependencies
---
