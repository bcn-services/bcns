# PLAN.md — Past-work case study system

**Status:** The marketing site is built and visually finished (layout-loop run merged 2026-07-20).
`/work` still renders its empty holding panel because `siteContent.pastWork.items` is `[]`.
This plan turns that section into real case studies: clickable cards → `/work/[slug]` detail
pages, illustrated with screenshots captured from locally-hosted client apps running **clean
seeded demo data**.

**Context:** `CLAUDE.md` (stack, conventions, `content.ts`-is-source-of-truth rule) ·
`LAYOUT_LOOP_REPORT.md` (the visual system these pages must match) ·
`PROGRESS.md` (log + current position) ·
`~/os/projects/bcns/README.md` (platform index).

## Global rules — apply to every item

- **Never publish real customer data.** Every screenshot and every fixture row uses invented
  names, addresses, phone numbers, and emails. No capture may come from a deployed instance,
  a production database, or a real client account. This is the point of the whole plan — an
  item that ships a real customer's details is a failed item regardless of how it looks.
- **Never invent a client outcome.** Agents do not write case study narrative. Every narrative
  field ships as an `[INPUT: …]` placeholder for Nate to fill, matching the convention already
  used across `lib/content.ts` and `CONTENT.md`. A plausible-sounding metric on a live
  marketing site is a lie about a real business.
- **`apps/web/lib/content.ts` is the single source of truth for copy.** Never hardcode strings
  into components. `apps/web/CONTENT.md` is its 1:1 mirror — update both in the same item.
- **Brand rules still hold** (see `LAYOUT_LOOP_REPORT.md`): one accent hue, pastel-blue
  `#7CB3FF` on charcoal-purple `#15131F`, no photography. Product UI screenshots are not
  photography and are allowed; stock or lifestyle imagery is not.
- **Match the existing visual system** — `components/reveal.tsx` for scroll-in, the shared
  hover-lift/glow utilities, `SectionHeading`'s opt-in serif accent. Do not invent a second
  motion vocabulary or rebuild `signature-motif.tsx`.
- **Two client repos are in scope** and are named per item: `~/bcns-client-delucas` and
  `~/bcns-client-l2detailz`. Work in the repo the item names; never cross-commit.
- Respect `prefers-reduced-motion`; hold text contrast to WCAG AA; layout must survive mobile
  and desktop.

---

- task: Wire a runnable `test` script for the marketing site so the existing suite can gate the loop
  done when:
    - `pnpm --filter web test` runs every `apps/web/__tests__/*.mjs` file via `node --test` and exits non-zero when any test fails
    - `pnpm test` from the repo root runs it through Turbo (a `test` task added to `turbo.json`)
    - All 12 existing test files in `apps/web/__tests__/` pass
  speed: N/A — build tooling, no data-size dependence
  status: done
  track: light

- task: Extend `PastWorkItem` in `apps/web/lib/content.ts` with case study detail fields and mirror them in `CONTENT.md`
  done when:
    - `PastWorkItem` carries `slug`, `problem`, `approach`, `outcome`, and `screenshots` (array of `{ src, alt, caption }`) alongside the existing optional `link`; `pnpm --filter web typecheck` passes
    - `siteContent.pastWork.items` holds exactly two entries with slugs `delucas` and `l2detailz`, and every narrative field on both is an `[INPUT: …]` placeholder string
    - A test asserts every slug is unique and matches `^[a-z0-9-]+$`; adding a duplicate slug fails it
    - `CONTENT.md` documents every new field 1:1 with the registry and the existing mirror test (`w4-content-mirror.test.mjs`) passes
    - Existing passing tests remain passing
  speed: N/A — compile-time static object, no data-size dependence
  status: not started
  track: full

- task: Add the `apps/web/app/work/[slug]/page.tsx` dynamic route rendering one case study
  done when:
    - `/work/delucas` and `/work/l2detailz` return 200 and render that item's problem, approach, and outcome text sourced from `siteContent.pastWork.items`
    - An unknown slug such as `/work/nope` renders the Next.js 404 (via `notFound()`), not a 500 and not an empty page
    - `generateStaticParams` emits exactly one path per registry item, so `pnpm --filter web build` prerenders both pages statically
    - Page title and meta description come from the item, following the `pageMeta` pattern already used in `app/work/page.tsx`
    - Median of 5 production renders of `/work/delucas` stays under 1s with both items in the registry
    - Existing passing tests remain passing
  status: not started
  track: full

- task: Make each Past Work card in `apps/web/components/past-work.tsx` link to its detail page
  done when:
    - Each rendered card is wrapped in a Next `<Link>` to `/work/<slug>`; a click anywhere on the card navigates there, and keyboard Enter on the focused card does the same
    - No nested anchors: the existing external `link` anchor inside the card body is moved out of (or removed from) the card `<Link>` wrapper, and a test asserts no `<a>` is rendered inside another `<a>`
    - The card exposes a visible focus ring meeting WCAG AA contrast against the card surface
    - The `items.length === 0` holding-state branch renders exactly as it does today when the registry has no items
    - Existing passing tests remain passing
  status: not started
  track: light

- task: Seed the DeLuca's mock bridge in `~/bcns-client-delucas` with an invented demo dataset
  done when:
    - An opt-in demo fixture (e.g. `VITE_DEMO_SEED=1 pnpm dev`) supplies the mock bridge with at least 3 months of invented transactions across every category, so the Dashboard tab renders non-zero Money in / Spent / Profit and a populated bar chart instead of today's zeros
    - Default `pnpm dev` behaviour is unchanged — without the flag the mock bridge returns what it returns today
    - A test asserts the fixture contains no real vendor or business name from the client's production data and that every dollar figure is invented
    - Median of 5 Dashboard tab renders with the fixture loaded stays under 1s
    - Existing 8-file test suite (`pnpm test`) remains passing
  status: not started
  track: full
  flag: data-path
  parallel-group: seeds

- task: Add a demo seed fixture to `~/bcns-client-l2detailz` that populates bookings, jobs, and the calendar
  done when:
    - A new `supabase/demo-seed.sql`, kept out of `supabase/migrations/` so it can never run against production, inserts at least 12 jobs spread across a single month with invented customer names, street addresses, and phone numbers
    - Applying it through the existing `supabase/local-test/run.sh` harness leaves the admin calendar month view showing jobs on at least 8 distinct days
    - A test asserts every phone number in the fixture falls in the 555 reserved range and no customer name in it appears in `0004_seed.sql` or any production export
    - Reference data still comes only from `0004_seed.sql` — the demo fixture adds customer/job rows and redefines no package or settings row
    - Median of 5 renders of the admin calendar month view stays under 1s with the fixture loaded
  status: not started
  track: full
  flag: data-path
  parallel-group: seeds

- task: Capture the three case study screenshots from the locally-hosted apps running their demo fixtures
  done when:
    - `apps/web/public/case-studies/` contains exactly three PNGs — `delucas-dashboard.png`, `l2detailz-frontend.png`, `l2detailz-calendar.png`
    - Each is captured through Claude-in-Chrome from the locally running app with its demo fixture loaded, never from a deployed instance: DeLuca's Dashboard tab at `localhost:3001` (`pnpm dev` is plain Vite browser mode via the mock bridge — do **not** build or boot the Electron shell), L2's public marketing homepage at `localhost:3100`, and L2's admin calendar month view at `localhost:3100`
    - Every image is at least 1200px wide, under 400KB, and a read of each confirms no real customer name, address, phone number, or email is visible
    - A test asserts all three files exist on disk and that each `screenshots[].src` value in the registry resolves to one of them
  speed: N/A — one-time asset capture, not a runtime path
  status: not started
  track: full
  flag: data-path

- task: Render each case study's screenshots on its detail page with `next/image`
  done when:
    - Each `/work/[slug]` page renders its registry `screenshots[]` entries via `next/image`, each with its non-empty descriptive `alt` and its caption rendered below the image
    - Images below the fold are lazy-loaded and `pnpm --filter web build` completes with no `next/image` warnings
    - A registry `screenshots[].src` pointing at a missing file fails the build rather than rendering a broken image
    - Images match the existing visual system: `Reveal` scroll-in, rounded surface and border consistent with the card treatment, and they hold layout at mobile and desktop without overflow
    - Median of 5 production renders of `/work/l2detailz` (2 images) stays under 1s
    - Existing passing tests remain passing
  status: not started
  track: full

> **⚠️ AUTONOMOUS RUN — STOP HERE**

- task: Replace every `[INPUT: …]` placeholder in the past-work registry with real client-approved copy and publish
  done when:
    - Written permission from L2 Detailz and from DeLuca's is recorded before either business is named on a public page; if either declines, that entry is anonymized to a sector description instead
    - No `[INPUT:` string remains anywhere in `siteContent.pastWork`, and `CONTENT.md` matches
    - L2 Detailz's live URL is set as its `link` only after its DNS cutover has completed
    - Each case study states one quantified outcome that the client has confirmed
  speed: N/A — copy only
  status: not started
  track: trivial
