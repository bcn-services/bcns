# Project Standards — bcns web

Project-specific efficiency, reliability, and resilience conventions observed in this codebase. These extend the global review standards and do not duplicate them.

## Platform Repo & Shared Packages

- **Shared packages publish to GitHub Packages.** `@nseluga/app-core`, `@nseluga/ui`, `@nseluga/config` are published (private) to `npm.pkg.github.com`; each carries a `publishConfig.registry` and a `files` list that ships its source. Bump the version and `pnpm -r publish --no-git-checks` to propagate; client repos consume by semver range, never `workspace:*`.
- **Packages ship raw TypeScript, no build step.** Consumers must transpile them — Next apps via `transpilePackages`, Vite/Electron apps by aliasing `@nseluga/ui` to the installed `src` entry. Do not add a compile step without also updating every consumer.
- **Installs require a classic PAT** with `read:packages` — the `gh` CLI OAuth token can publish but 403s on downloads. Auth lives in the machine's `~/.npmrc` (or `GITHUB_TOKEN` env), never committed.
- **Scope = account owner (temporary).** The `@nseluga` scope exists only because GitHub Packages ties npm scope to the owning account; migrating to a `bcns` org (rename `@nseluga/*` → `@bcns/*`) is deferred. The `@bcns` brand lives in repo names, not the package scope.

## Electron Security

> These apply to **client desktop repos** (e.g. `bcns-client-delucas`) — the
> platform repo no longer contains an Electron app. Kept here as the shared standard.
>
> Native-module note: `better-sqlite3` (and other native deps) can only be built
> for one ABI at a time — run tests on the **Node** build (`pnpm rebuild better-sqlite3`),
> run/package the app on the **Electron** build (`electron-builder install-app-deps`).
> Switching contexts requires a rebuild.

- **Electron BrowserWindow sandbox**: all BrowserWindow instances must set `sandbox: true`; preload `contextBridge` works under sandbox and does not require `sandbox: false`.
- **IPC boundary test coverage**: the import-boundary static-analysis test must scan every source directory whose output is bundled into the renderer (at minimum `src/renderer/` and `src/bridge/`), not just `src/renderer/`.
- **IPC sql channels**: any `db:*` ipcMain handler that reaches SQLite must use parameterized queries and must never pass the raw client-supplied sql string directly to `db.prepare()`; the channel is a SQL injection vector unless the handler validates or allowlists the statement.
- **IPC partial-update handlers must validate individual fields**: `db:updateX` handlers that accept a `Record<string, unknown>` updates object must allowlist permitted keys and validate each value type before passing to the query function; `Object.keys()` on an unvalidated object interpolates attacker-controlled column names into the SET clause.
- **IPC handler return-type consistency**: within a `db:*` handler group, validation failures must either all throw (letting Electron IPC surface the rejection to the renderer's catch block) or all return `{ok, error}` — mixing the two shapes on the same logical channel causes silent type mismatches in the renderer.

## Content Registry

- **Static content registry pattern**: all section copy lives in `apps/web/lib/content.ts` as a single `siteContent` const; icons are parallel `as const` arrays in component files indexed by position; `siteConfig` in `apps/web/lib/site.ts` remains the sole source for `name`, `domain`, and `email` and is never imported into the content registry.
- **Tuple-length enforcement**: registry item arrays are typed as fixed-length tuples (e.g. `[StepItem, StepItem, StepItem]`) to statically enforce parity with icon arrays; any new section must match its icon array length exactly and add a matching icon array entry in the component file. Icon-free sections (PastWork, Reviews, Pricing, Faq, AboutFounder) are exempt and may use open `[]` array types, since there is no parallel icon array to stay in sync with.
- **SLOT placeholder convention (retired)**: `[SLOT: section/field-name]` was the original draft-copy placeholder; the codebase is now at zero occurrences (enforced by `b3-copy-wiring.test.mjs`). The live convention for Needs-Nate fields is `[INPUT: descriptive text]` — see below.
- **`[INPUT: descriptive text]` convention**: fields awaiting real, confirmed detail (pricing/turnaround slots, founder credentials, past-work case-study copy) ship as a literal `[INPUT: ...]` string, matched by tests via `/^\[INPUT: .+\]$/`. For fields describing a real client or business (e.g. `pastWork.items[n]`), this is an anti-fabrication guard, not just a draft marker — never replace it with plausible-sounding invented prose; only the confirmed detail. Every `[INPUT: ...]` token must also appear in `CONTENT.md`'s "Remaining `[INPUT: …]` slots (Needs-Nate)" table, byte-for-byte identical to `content.ts` — those two surfaces only. `b3-copy-wiring.test.mjs` derives its token set from `siteContent` at runtime, so it needs no update (see Content Registry Testing below).
- **Case-study item identity**: `pastWork.items[n]` (and any future open-array registry item meant to be individually addressable — detail-page routes, React keys) carries a `slug` field, unique across the array and matching `^[a-z0-9-]+$`; tests must assert this as a general invariant over the whole array (`new Set(slugs).size === slugs.length`, a regex loop), not as a pairwise comparison of the current entries — new entries must not require new test cases.

## Navigation

- **NavCards must mirror all primary routes**: `apps/web/components/nav-cards.tsx` must have one card per entry in `siteConfig.nav`; omitting a route leaves it unreachable on mobile where the header nav is hidden (`hidden md:flex`).

## Fault Tolerance

- **Fetch timeout required on external endpoints**: any client-side `fetch` to a third-party API (e.g. the contact form endpoint) must include `signal: AbortSignal.timeout(N)` to prevent the UI from hanging indefinitely on a slow or unresponsive external service.

## Content Registry Testing

- **STRUCTURAL_KEYS exclusion must use path suffix matching**: the `collectStrings` helper in `content-registry.test.mjs` must exclude structural fields by checking `path.endsWith('.href')` or `path.endsWith('.photo')` rather than propagating a `parentKey` argument; parent-key propagation silently drops the exclusion guard when strings appear inside arrays nested under a structural key.
- **Derive placeholder allowlists, never hand-list them**: `b3-copy-wiring.test.mjs` used to hand-maintain an `APPENDIX_INPUT_TOKENS` literal list, which false-failed on every token added afterwards (cost one fix cycle in the W5 past-work pass). It now walks `siteContent` recursively and extracts every `\[INPUT:[^\]]+\]` substring — substring, not whole-string, because tokens can be embedded mid-string (`about.founders[1].bio`). Any built-HTML check comparing rendered text to registry strings must also decode HTML entities first (`&#x27;`, `&#39;`, `&amp;`, `&quot;`, `&lt;`, `&gt;`, with `&amp;` decoded last so a double-encoded literal round-trips) — React escapes rendered text, so an apostrophe-bearing token never matches raw.
- **CONTENT.md cross-check table must be updated for every new field, including container fields**: when a registry field is itself an object/array with its own sub-fields (e.g. `pastWork.items[n].screenshots`, an array documented in prose as its own field before its `.src`/`.alt`/`.caption` members), the cross-check table needs a row for the container field too, not just its leaves — otherwise the table's field count and the stated "Total registry fields: N" arithmetic silently drift apart.
