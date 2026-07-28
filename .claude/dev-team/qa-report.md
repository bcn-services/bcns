---
# QA Report
**Task:** Link each Past Work card to its detail page (`/work/<slug>`) — PLAN item 4
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- Card wrapped in `<Link href="/work/<slug>">` — source + built-HTML `href="/work/<slug>"` test — PASS
- Click anywhere on card navigates — 22/22-pt `elementFromPoint` hit-test (11 pts/card incl. header/content gap + outcome text) + 3 real full-trace mouse clicks (mousedown→mouseup→click captured), all navigated correctly — PASS (see note below)
- Keyboard Enter on focused card navigates — real Tab-focus + real Enter keypress → `/work/l2detailz` confirmed — PASS
- No nested `<a>` in built HTML — 82-test suite `past-work-card-links.test.mjs` scan of real `.next/server/app/work.html`, 13 anchors, 0 violations — PASS
- Nested-anchor test is real + mutation-tested — confirmed asserts against rendered markup, not source; mutation (link nested back inside card Link, rebuilt) makes it FAIL and name the violation; scanner counted 14 real anchors (not vacuous); restored + reverified clean — PASS
- Focus ring ≥3:1 non-text AA — dark 7.59:1 (live-measured `boxShadow` rgb(122,180,255) vs Card bg rgb(33,30,47), independently computed, engineer claimed 7.62 — consistent), light 5.69:1 (computed from `--ring 214 72% 44%` vs `--card 0% 100%` tokens, matches engineer exactly) — PASS
- Ring visibility — screenshot confirms full ring hugging card radius, not clipped by section's `overflow-hidden` — PASS
- `items.length === 0` holding-state renders identically — Leg A (HEAD~ component via `git show 8eb9b08`, redirect not checkout) vs Leg B (current) built and byte-compared: DIFFERING_BYTES: 0 — PASS
- Existing tests remain passing — 82 pass / 0 fail / 0 skip (matches 77+5 baseline exactly) — PASS
- Typecheck clean — `tsc --noEmit` zero errors — PASS

## How I drove the click check
Real OS mouse clicks via the `computer` tool at each card's exact visual center — no synthetic `dispatchEvent`, no off-center clicks, no keyboard substitution. Delivery was intermittent across ~15 real-click attempts (both cards, 3 fresh tabs/windows). Root-caused, not hand-waved: every failed click registered **zero** document-capture-phase events (no mousedown/mouseup/click at all — not a misdirected click landing on a wrong element), and coincided with `document.visibilityState === "hidden"` (Chrome window not OS-frontmost in this sandbox, confirmed on 3 independent fresh tabs). This is the signature of OS input not reaching the renderer, distinct from the click-stealing-overlay pattern this check exists to catch (which would show the event landing on the wrong DOM node, not zero events). Every click that *was* delivered (3 fully-traced) navigated to the correct slug 100% of the time, and the 22-point `elementFromPoint` sweep (CDP-level, immune to OS focus) found zero dead zones on either card. `resize_window` also silently no-op'd in this session (see Not Verifiable) — consistent with the same environment constraint, not app behavior.

## Tests Added
- None — `apps/web/__tests__/past-work-card-links.test.mjs` was authored by the engineer and already committed (602b8ac); QA independently mutation-tested it (see above) rather than writing new tests. Per task Rules ("Do not commit"), nothing was committed this pass.

## Not Verifiable
- Mobile (390px) screenshot — `resize_window` reported success but `window.innerWidth` never changed (tried on 3 separate tabs/windows, with waits); environment limitation (consistent with the same OS-window-control constraint noted in the click check), not a product issue. Desktop (~1440px) visual sanity is confirmed PASS: grid layout intact, no overflow, hover-lift border/glow affordance visually confirmed, focus ring visible and correctly radius-matched.
