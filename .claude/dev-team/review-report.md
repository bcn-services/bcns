---
# Review Report — P5 (Dashboard)
**Date:** 2026-07-15
**Files Reviewed:** 14
**Standards Applied:** efficiency, reliability, scalability, security, fault tolerance

## Summary
The P5 implementation is fundamentally sound: IPC handlers validate inputs at the boundary, the dynamic SET clause in `updateTransaction` operates on a pre-validated, typed key set (no injection path), and the React cleanup pattern (`cancelled` flag + `clearInterval`) correctly prevents memory leaks. Three Important findings: `updateRecurringRule` passes raw client data directly to SQLite without field validation, which is an injection-adjacent gap; `getTransactionsForMonth` returns `{ok, error}` on validation failure while the renderer treats its return type as `Transaction[]`, causing a silent type mismatch that drops the error; and `BannerList`'s `useEffect` re-runs whenever `dismissedError` changes, including after a dismiss, producing a no-op re-render loop on every dismiss action.

## Findings

### Important
- `apps/delucas/src/shell-electron/main.ts:431–443` — **Security / Validate at Boundaries** — `db:updateRecurringRule` passes `updates: Record<string, unknown>` directly to `updateRecurringRule(db, id, updates)` with no field allowlist or value validation; `updateRecurringRule` in queries.ts calls `Object.keys(updates)` and interpolates those keys directly into the SET clause; a renderer that sends `{ "id = 1; DROP TABLE transactions; --": 1 }` would pass the query intact to `db.prepare()` — validate each key against an explicit allowlist (`label`, `amount_cents`, `direction`, `category`, `vendor`, `day_of_month`, `end_date`) and each value against its type before passing to the query function, matching the pattern already used in `db:updateTransaction`.
- `apps/delucas/src/shell-electron/main.ts:305–314` — **Reliability / Explicit Over Implicit** — `db:getTransactionsForMonth` returns `{ ok: false, error: "…" }` on bad input but returns a `Transaction[]` on success; the bridge type declares return type `Transaction[]`; the renderer hook in `useDashboardData.ts` does `setTransactions(txs ?? [])` treating the return as an array — when validation fails the object `{ok,error}` is stored as the `transactions` state and rendered as an empty list with no error surfaced; throw instead of returning `{ok,error}` to match `getTransactionsByMonth` (which throws) and the renderer's catch-path.
- `apps/delucas/src/renderer/components/BannerList.tsx:28–32` — **Reliability / Handle Errors at Boundaries** — the `useEffect` has `[currentError, dismissedError]` in its dependency array; when the user dismisses a banner, `setDismissedError(currentError)` fires, which triggers the effect again immediately; the effect checks `if (currentError !== dismissedError)` — at that point they are equal so it does nothing, but it still re-runs on every dismiss causing an unnecessary render cycle; remove `dismissedError` from the dep array and guard only on `currentError` (the effect only needs to reset state when the error string changes, not when the dismissed string changes).

### Minor
- `apps/delucas/src/renderer/pages/Dashboard.tsx` and `apps/delucas/src/renderer/pages/AddFix.tsx` — **Scalability / No Global Mutable State** — both pages maintain independent `currentMonth` state; switching tabs while navigating months resets the month on the other tab; deferred per engineer, noted here because the symptom is user-visible state loss — acceptable for v1 per spec, but worth lifting to App.tsx if the spec ever calls for consistent month across tabs.
- `apps/delucas/src/renderer/components/ProfitBarChart.tsx:43` — **Efficiency / Hoist Invariants** — `Math.max(1, ...profits.map(Math.abs))` maps `profits` twice (once to get absolute values, once spread into Math.max); hoist to `Math.max(1, ...profits.map(p => Math.abs(p)))` already done but `profits` itself is computed via `series.map` inside render — no perf concern at 12 items, no action needed.
- `apps/delucas/src/renderer/components/TransactionList.tsx` — **Reliability / Don't Assume Success** — `handleDelete` swallows the error on failure: `console.error` only, no user feedback; the row stays in a non-deleting state but the user has no indication the delete failed — surface the error string to a local `deleteError` state the same way `editError` is handled for edits.

## STANDARDS.md Updates
- **IPC partial-update handlers must validate individual fields**: `db:updateX` handlers that accept a `Record<string, unknown>` updates object must allowlist permitted keys and validate each value type before passing to the query function; `Object.keys()` on an unvalidated object interpolates attacker-controlled column names into the SET clause.
- **IPC handler return-type consistency**: within a `db:*` handler group, validation failures must either all throw (letting Electron IPC surface the rejection to the renderer's catch block) or all return `{ok, error}` — mixing the two shapes on the same logical channel causes silent type mismatches in the renderer.

---
# Review Report — P1 (Electron scaffold)
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
