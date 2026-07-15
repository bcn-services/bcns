---
# Review Report — B2 (Registry rework)
**Date:** 2026-07-14
**Files Reviewed:** 6
**Standards Applied:** efficiency, reliability, scalability, security, fault tolerance

## Summary
The B2 implementation is sound for a static Next.js site with no backend calls or auth paths. No Critical or security findings. The most significant issue is a `STRUCTURAL_KEYS` exclusion in the test that is keyed on the *parent* property name, which silently skips any nested string when a grandparent's key matches — a fragile assumption that will miss copy SLOT violations as the registry grows. The hardcoded `/#contact` hrefs in two components is a minor maintainability hazard already flagged by the engineer.

## Findings

### Important
- `apps/web/__tests__/content-registry.test.mjs:53-57` — **Reliability / Fail Fast** — `collectStrings` skips a string value when its *direct* parent key is in `STRUCTURAL_KEYS`, but array children pass `parentKey = ""` (line 57), so a nested object under an array entry never propagates the structural key; the guard works for `navCards.items[0].href` but would miss a deeply nested structural field if the schema grows — use a path-based exclusion (`path.endsWith('.href') || path.endsWith('.photo')`) instead of parent-key propagation.
- `apps/web/components/past-work.tsx:30` and `apps/web/components/reviews.tsx:30` — **Reliability / Explicit Over Implicit** — CTA `href="/#contact"` is hardcoded in both holding-state blocks; if the contact CTA target ever changes, both files need updating and there is no compile-time or test signal — add `ctaHref: string` to `HoldingState` interface and populate with a `[SLOT: …]` or a structural value, and read it in both components.

### Minor
- `apps/web/components/about-founder.tsx:26` — **Reliability / Explicit Over Implicit** — `key={index}` used on the `founders` tuple; since founders are a fixed 2-element tuple, use `key={founder.name}` (a stable, unique identity already present) to avoid silent stale-render bugs if the tuple ever gains conditional rendering.
- `apps/web/components/past-work.tsx:39` and `apps/web/components/reviews.tsx:39` — **Reliability / Explicit Over Implicit** — `key={index}` used on dynamic `items` arrays that could be reordered or filtered; use a stable field (`workTitle` / `author+company`) as the key to avoid reconciliation bugs when items shift.
- `apps/web/__tests__/content-registry.test.mjs:71-78` — **Reliability / Fail Fast** — `REQUIRED_KEYS` array in Test 1 still lists only the original 6 section keys and does not include `pastWork`, `reviews`, `pricing`, `faq`, `about`, `navCards`, or `pageMeta`; new top-level keys added in B2 are invisible to this presence check — add the B2 keys to `REQUIRED_KEYS` (or replace with `Object.keys(siteContent)`).

## STANDARDS.md Updates
- **STRUCTURAL_KEYS exclusion must use path suffix matching**: the content-registry test's structural-key bypass should check `path.endsWith('.href')` / `path.endsWith('.photo')` rather than propagating a `parentKey` argument; parent-key propagation silently drops the guard when strings appear inside arrays under structural keys.

---
# Review Report
**Date:** 2026-07-14
**Files Reviewed:** 11
**Standards Applied:** efficiency, scalability, reliability, security, fault tolerance

## Summary
The implementation is structurally sound — static-only Next.js App Router pages with no async data fetching, no server state, and no security-sensitive paths. Two actionable findings: the home NavCards component omits the `/about` route, leaving About unreachable on mobile (header nav is hidden below `md`); and the contact form fetch has no timeout, meaning a slow or hanging external endpoint will stall form submission indefinitely.

## Findings

### Important
- `apps/web/components/nav-cards.tsx:5` — **Reliability / Fail Fast** — `/about` card is absent; on mobile (header nav hidden via `hidden md:flex`) About is unreachable from any entry point — add a 4th card `{ label: "About", description: "…", href: "/about" }` and change the grid to `sm:grid-cols-2 lg:grid-cols-4`
- `apps/web/components/contact-form.tsx:76` — **Fault Tolerance / Timeouts on All External Calls** — `fetch(ENDPOINT, …)` has no timeout; a slow or hanging third-party form API will hang the submit button indefinitely — add `signal: AbortSignal.timeout(10_000)` to the fetch options

### Minor
- `apps/web/app/sitemap.ts:7,13,18,23,28,33,38` — **Efficiency / Lazy Where Appropriate** — `new Date()` called 7 separate times; hoist `const now = new Date()` once at the top of the function and reference it in each entry
- `apps/web/components/hero.tsx:50` — **Reliability / Explicit Over Implicit** — `key={index}` on static proof-point list; use a stable string key (e.g. the point text or `proof-${index}`) in case the array gains conditional entries

## STANDARDS.md Updates
- **NavCards must mirror all primary routes**: `nav-cards.tsx` should have one card per entry in `siteConfig.nav`; omitting a route leaves it unreachable on mobile where the header nav is hidden
- **Fetch timeout required on external endpoints**: any client-side `fetch` to a third-party API must include `signal: AbortSignal.timeout(N)` to prevent indefinite hangs

---
# Review Report — A2 (archived)
**Date:** 2026-07-13
**Files Reviewed:** 8
**Standards Applied:** reliability, scalability, safety & security

## Summary
The A2 implementation is structurally sound and ships a clean data-driven shell for all 5 sections with no security or data-integrity issues. The most significant finding is a broken `link` field — rendered as plain text, never as an anchor — which defeats its own intent. Hardcoded card-title strings and a missing `description` field on `AboutFounder` are smaller gaps that prevent full content-management by data edit alone. No runtime crashes or security issues found.

## Findings

### Important
- `apps/web/components/past-work.tsx:33` — Reliability/**Explicit Over Implicit**: `link` field rendered inside `<p>` as plain text; URLs are displayed but not navigable — change to `<a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">`
- `apps/web/components/about-founder.tsx:27,34` — Reliability/**Explicit Over Implicit**: "Background" and "Credentials" card titles are hardcoded strings, not content-registry fields; a data-only edit cannot relabel them — add `cardTitleBio: string` and `cardTitleCredentials: string` to `AboutFounderContent` and populate with SLOT values in `siteContent`
- `apps/web/components/about-founder.tsx:21` — Reliability/**Explicit Over Implicit**: `description=""` is hardcoded; `AboutFounderContent` has no `description` field so the prop can never hold real copy — add `description?: string` to `AboutFounderContent` and pass `description ?? ""` from `siteContent.aboutFounder`

### Minor
- `apps/web/lib/content.ts:88` — Reliability/**Explicit Over Implicit**: `PastWorkItem.link` is typed as required `string` but the component guards with `{link && ...}`, using empty string as a silent "no link" sentinel — type as `link?: string` to make optionality explicit and eliminate the implicit falsy check
- `apps/web/lib/content.ts:86-97,99-111,113-125,127-137,139-144` — Scalability/**No Global Mutable State** (STANDARDS.md tuple rule): new section item arrays (`PastWorkItem[]`, `ReviewItem[]`, `PricingTier[]`, `FaqItem[]`, `string[]`) are open arrays while STANDARDS.md mandates fixed-length tuples; none of these sections have parallel icon arrays, so the tuple rule's rationale (icon-parity enforcement) does not apply — update STANDARDS.md to explicitly exempt icon-free sections, or add a comment in each interface explaining why they are open arrays

## STANDARDS.md Updates
- Added under **Content Registry**: icon-free sections (PastWork, Reviews, Pricing, Faq, AboutFounder) may use open `[]` array types rather than fixed-length tuples; the tuple rule applies only when a component-level icon array must stay in sync with the registry array.
---
