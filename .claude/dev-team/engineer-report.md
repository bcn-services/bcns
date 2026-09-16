---
# Engineer Report
**Task:** platform-v1 chunk 4 — add a "Sign in" link to the marketing site header pointing at https://connect.bcn-services.com
**Branch:** pv1/4-hub
**Date:** 2026-09-16

## Design Decisions
- Added `siteConfig.signIn: { label, href }` as a field separate from `siteConfig.nav` in `apps/web/lib/site.ts` — grepped all `siteConfig.nav` usages first (`site-header.tsx` x2, `site-footer.tsx`) and confirmed `nav` is mapped as in-page anchor/scroll targets, so an external URL doesn't belong in that array.
- Rendered as a plain `<a>` (not `next/link`, since it's external) with `rel="noopener"` — no new component, styled with the exact className strings already used by the adjacent nav `<Link>`s (desktop: text link style; mobile: block disclosure-item style).
- No `content.ts`/`CONTENT.md` change — `signIn` is a nav/config constant per CLAUDE.md's `lib/site.ts` scope, not marketing copy.

## Files Changed
- `apps/web/lib/site.ts` — added `signIn` field to `siteConfig`.
- `apps/web/components/site-header.tsx` — added the Sign-in `<a>` after the desktop nav items (inside `<nav>`) and inside the mobile `<details>` disclosure, before the existing CTA link.

## Deferred / Out of Scope
- Nothing deferred; scope was exactly the header link.

## Flags for Reviewer
- No hot paths, queries, or retry-sensitive writes touched — pure static link.
- Verified `apps/web/__tests__/isolation.test.mjs` stays green since the addition is a plain `<a href>` string, not a `fetch` call, so it doesn't trip the "no fetch to connect/mcp/sb subdomains" check.

## Verification
1. `corepack pnpm turbo run build typecheck lint test --filter=@bcn-services/web --concurrency=1` — Tasks: 3 successful, 4 total (build/typecheck/lint clean; test task "failed" only because of the pre-existing counted failure below). Test totals: `# tests 86 # pass 85 # fail 1`, `Failing test: __tests__/a2-fix-verification.test.mjs — description not wired to SectionHeading` — matches `docs/architecture/baselines/2026-09-15/bcns/test-counts.txt:16-17` exactly (pre-existing, not introduced by this change).
2. `cd apps/web && node --test __tests__/isolation.test.mjs` — 4/4 pass.
3. Gate (d) re-capture (`next start -p 3417`, curl'd all 9 baseline routes + `/work/delucas` + `/work/l2detailz`, normalized): `RESULT: CHECK (4/11 identical)`. `privacy.html`, `robots.txt.html`, `sitemap.xml.html`, `terms.html` IDENTICAL (no header link on those templates/no change). `__.html`, `about.html`, `pricing.html`, `services.html`, `work.html` DIFFER by exactly 4 token lines each: 2 are the new Sign-in `<a>` (desktop + mobile), 2 are that same anchor's HTML re-serialized inside the RSC flight `self.__next_f.push` payload (same shared header, so it shows twice per route) — no other diff lines. `work-delucas.html`/`work-l2detailz.html` report MISSING on the baseline side — expected, the 2026-09-15 baseline capture never included per-slug `/work/*` routes (only the 9 top-level routes), so this is a gap in gate-d's original scope, not a regression. Output saved to `/Users/nateseluga/.claude/jobs/d6dffe8b/tmp/gate-d-chunk4/normalize.txt`. Server killed after capture.
4. `git status --short -- apps/web`: `M apps/web/components/site-header.tsx`, `M apps/web/lib/site.ts`. `git diff --stat -- apps/web`: 2 files changed, 15 insertions(+).

## Unexpected
- Mid-task, this agent's working directory was silently switched by the harness to a sibling worktree (`pv1-3-tenant`, another engineer's branch) between two tool calls, with no action taken by this agent. Caught it immediately via `pwd`/`git branch --show-current` before running any command there, and used `EnterWorktree` with `path` to switch back to `pv1-4-hub` before continuing. No files were read or written in `pv1-3-tenant`.
