BUILT — polish/docs — 77e9bd7 (uncommitted, orchestrator commits) — self-check: cd apps/web && rm -rf .next && pnpm test pass

# Engineer Fix Report (round 1, Item C)
Findings addressed: 6 of 6 (3 Important + 3 Minor), 0 disputed, 0 deferred.

Sources read for disconnect behaviour: platform/supabase/migrations/20261007000500_source_disconnect.sql:19-21 (owner-only, BCNS2), platform/worker/src/disconnect.ts:45-46,96-101,135-147, apps/connect/lib/sources.ts:274-277, apps/connect/app/signup/{page,actions}.tsx, apps/connect/app/login/page.tsx:60-110.

1. Important, content.ts legal.privacy "Requesting deletion": owner-only, monday.com, Google caveat. Final text (two body strings):
   - "Your account owner can also disconnect QuickBooks Online, Meta Ads, monday.com, Google Drive or meeting notes in the hub. We then delete the token and data we stored for that source and cancel our access with Intuit, Meta or Google (for Google, once Drive and meeting notes are both disconnected, if they use the same Google account)."
   - "monday.com gives us no way to cancel access, so remove bcns in monday.com as well."
2. Important, same array: both strings now come after "These requests are handled by a person..." (last in body); that line is unchanged.
3. Minor, content.ts maintainer comment: removed dangling "It deliberately"; comment now ends "...read/write Intuit scope."
4. Minor, platform-v1.md :212-216: now "reaches only /login (sign-in and forgot-password), plus /signup when the hub's SIGNUP_ENABLED flag is on (its server action calls the public signup Edge Function; with the flag off, /signup is a 404, there is no "Create account" link, and only the Shopify-install finish variant of the page shows a mailto to bcns)." I did not use the suggested "otherwise the page offers only a mailto": login/page.tsx shows the mailto only in the finishingShopify branch (line 68), so the suggested clause was untrue for plain visitors.
5. CONTENT.md :1090: sentence now says the disconnect sentences sit last in "Requesting deletion" after the person-handled line; owner-only; revoke at Intuit, Meta and Google (Google only once Drive and meeting notes are both disconnected on the same Google account); monday.com not revocable by us, owner removes bcns there. No field added; "Total registry fields" untouched.

Verification (executed):
- cd apps/web && rm -rf .next && pnpm test: tests 106, pass 94, fail 0, skipped 12.
- pnpm test:docs (root): pass 21, fail 0.
- grep "no sign-up route|until 2026-10-01" platform-v1.md: empty. grep "when the hub disconnect ships" CONTENT.md content.ts: empty. grep "nothing to revoke|yourself in the hub" apps docs: empty.
- git diff chore/connect-polish --name-only excluding .claude/: apps/web/CONTENT.md, apps/web/lib/content.ts, docs/architecture/platform-v1.md only.

git status --short:
 M apps/web/CONTENT.md
 M apps/web/lib/content.ts
 M docs/architecture/platform-v1.md
(plus .claude/dev-team/engineer-fix-report.md, untracked)

Flag: effectiveDate left as the first build set it; wording changed but no new claim added beyond what the code does.
