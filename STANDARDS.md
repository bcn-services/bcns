# Project Standards — bcns web

Project-specific efficiency, reliability, and resilience conventions observed in this codebase. These extend the global review standards and do not duplicate them.

## Content Registry

- **Static content registry pattern**: all section copy lives in `apps/web/lib/content.ts` as a single `siteContent` const; icons are parallel `as const` arrays in component files indexed by position; `siteConfig` in `apps/web/lib/site.ts` remains the sole source for `name`, `domain`, and `email` and is never imported into the content registry.
- **Tuple-length enforcement**: registry item arrays are typed as fixed-length tuples (e.g. `[StepItem, StepItem, StepItem]`) to statically enforce parity with icon arrays; any new section must match its icon array length exactly and add a matching icon array entry in the component file. Icon-free sections (PastWork, Reviews, Pricing, Faq, AboutFounder) are exempt and may use open `[]` array types, since there is no parallel icon array to stay in sync with.
- **SLOT placeholder convention**: all copy fields use `[SLOT: section/field-name]` string values; ordinal structural defaults (step numbers `"01"`, `"02"`, `"03"`) are not SLOT-ified.

## Navigation

- **NavCards must mirror all primary routes**: `apps/web/components/nav-cards.tsx` must have one card per entry in `siteConfig.nav`; omitting a route leaves it unreachable on mobile where the header nav is hidden (`hidden md:flex`).

## Fault Tolerance

- **Fetch timeout required on external endpoints**: any client-side `fetch` to a third-party API (e.g. the contact form endpoint) must include `signal: AbortSignal.timeout(N)` to prevent the UI from hanging indefinitely on a slow or unresponsive external service.

## Content Registry Testing

- **STRUCTURAL_KEYS exclusion must use path suffix matching**: the `collectStrings` helper in `content-registry.test.mjs` must exclude structural fields by checking `path.endsWith('.href')` or `path.endsWith('.photo')` rather than propagating a `parentKey` argument; parent-key propagation silently drops the exclusion guard when strings appear inside arrays nested under a structural key.
