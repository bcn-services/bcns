# bcns baseline capture — 2026-09-15

Source: clean clone of `bcn-services/bcns` main at commit `61885848dc56abfe138f3069bf17ce635861d153` (matches requested `6188584`).
Tooling: `corepack pnpm` (packageManager `pnpm@9.15.0`), Node `v22.14.0`.

## Counts table

| Check | Result | Detail |
|---|---|---|
| install | OK (exit 0) | `install.txt` |
| pnpm -r ls | OK — 5 workspace packages | root `bcns`, `@bcn-services/web`, `@bcn-services/app-core`, `@bcn-services/config`, `@bcn-services/ui` — `pnpm-ls.txt` |
| lint | OK (exit 0), 3/3 turbo tasks | `lint.txt` |
| typecheck | OK (exit 0), 3/3 turbo tasks | `typecheck.txt` |
| test | **FAILED (exit 1)** | see below — `test.txt`, `test-counts.txt` |
| build | OK (exit 0) | `build.txt`, `routes.txt` |
| prod routes captured | 9/9, all HTTP 200 | `prod-html/`, `prod-headers.txt` |
| local routes captured | 9/9, all HTTP 200 | `local-html/`, `local-headers.txt` |
| local vs prod diff | differs on all 9 (expected causes only) | `local-vs-prod.txt` |
| routes in Next build | 8 static + 1 dynamic (`/work/[slug]` → 2 pages) | `routes.txt` |

## Test detail

`pnpm test` = `turbo run test && pnpm test:docs && pnpm test:infra`. `turbo run test` failed
(apps/web), so `test:docs`/`test:infra` never ran in the gated pipeline (bash `&&` short-circuit).

- `@bcn-services/app-core`: 7 test files run via `tsx`, all exited 0, no failures reported.
- `@bcn-services/web`: node test runner, `__tests__/*.mjs` — **82 tests, 81 pass, 1 fail.**
  Failing: `__tests__/a2-fix-verification.test.mjs` → `about-founder.tsx passes description to
  SectionHeading — description not wired to SectionHeading`. Pre-existing in this commit, not
  caused by this capture.
- `test:docs` and `test:infra` were re-run standalone (outside the gated `pnpm test` pipeline,
  informational only): `test:docs` 21/21 pass; `test:infra` 18/18 pass.

## Routes

Next.js build produced 11 route table rows: `/`, `/_not-found`, `/about`, `/icon.svg`, `/pricing`,
`/privacy`, `/robots.txt`, `/services`, `/sitemap.xml`, `/terms`, `/work`, and dynamic
`/work/[slug]` → `/work/delucas`, `/work/l2detailz`. Full table in `routes.txt`.

## prod-html / local-html

Captured all 9 requested static routes (`/`, `/about`, `/pricing`, `/services`, `/work`,
`/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`) from both `https://bcn-services.com` and a
local `next start -p 3999` of the same build artifacts. All 18 requests returned HTTP 200.

**`/work/<slug>` substitution note:** the live `sitemap.xml` does not list any `/work/<slug>`
URLs (it only contains the 7 top-level static routes above), even though the app has two known
case-study slugs (`delucas`, `l2detailz`) visible in the Next build output. Per the instructions
("every `/work/<slug>` URL listed in sitemap.xml"), zero were fetched since the sitemap lists
none — this was not treated as a failure, just recorded here since it may be worth a follow-up
(the sitemap generator appears to only emit static top-level routes, not the dynamic work items).

## local-vs-prod diff

`diff -r` of the normalized dirs shows all 9 files as "differing," but each file is a single
minified HTML/XML line, so any change makes `diff -r` print the whole line. Isolating the actual
differing substrings (see header note in `local-vs-prod.txt`) found only two causes, both
expected/environmental, no functional or content regressions:

1. **Site origin** — prod pages use `https://bcn-services.com` in canonical/OG/JSON-LD tags and
   `sitemap.xml`; the local build falls back to a hardcoded `http://localhost:3000` default
   (unrelated to the actual `:3999` port used here).
2. **Non-deterministic tokens** — a few short random alphanumeric ids inside the Next.js RSC
   flight-stream payload differ per build/request, and `sitemap.xml`'s `<lastmod>` is generated
   from `new Date()` at request time.

No other byte differences were found across `/`, `/about`, `/pricing`, `/services`, `/work`,
`/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`.

## Failures / substitutions (verbatim summary)

- `pnpm test` exits 1 due to one failing assertion in
  `apps/web/__tests__/a2-fix-verification.test.mjs` (see Test detail above). Recorded verbatim
  in `test.txt`; not fixed (no source edits allowed for this capture).
- `test:docs` / `test:infra` did not run inside the gated `pnpm test` command due to the `&&`
  short-circuit above; standalone re-runs (informational, outside the official capture) both
  passed and are noted in `test-counts.txt`.
- Live `sitemap.xml` lists no `/work/<slug>` URLs, so no dynamic work-item pages were fetched for
  `prod-html`/`local-html` (see prod-html/local-html note above).
- No `.env*` or `~/.config/bcns/*` files were opened or printed. No git commit/push, no `gh`
  writes, no Vercel commands, no deploys, no dependency or source changes were made. The local
  Next.js server (port 3999) was started and stopped cleanly for the capture.
