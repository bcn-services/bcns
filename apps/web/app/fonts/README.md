# Self-hosted fonts

These are loaded by `app/layout.tsx` via `next/font/local`. They replaced
`next/font/google`, which downloaded the same binaries from Google's CDN during
every cold compile.

## Why self-hosted

`next/font/google` fetches over the network **at build time**, not at runtime:

- 16 round-trips for these three families (3 CSS requests + 13 font binaries).
- In dev each fetch is aborted after a hard-coded 3000ms and retried, which is
  what produced the `The user aborted a request. / Retrying 1/3...` spam and
  ~10s of a 13.9s cold compile. Nothing about it was network-speed related —
  Google answers in ~70ms; the 3s budget was being spent competing with webpack
  for the event loop.
- In a **production** build there is no abort timeout at all. After 3 failed
  retries it throws, so `next build` *fails* if fonts.googleapis.com is
  unreachable. There is no cache that survives a clean checkout and no
  documented opt-out, so CI had a hard dependency on Google's CDN.

Self-hosting removes the network from both dev and CI. Font rendering is
unchanged — see below.

## Why only 3 files instead of 13

`subsets: ["latin"]` does **not** limit what gets downloaded. It only controls
which subset gets `rel=preload`; `next/font/google` still fetches every subset
Google returns (Inter alone pulled 7: latin, latin-ext, cyrillic, cyrillic-ext,
greek, greek-ext, vietnamese).

Only latin is shipped here. Every non-ASCII character in the site's rendered copy
(`—` U+2014, `·` U+00B7, `©` U+00A9, `…` U+2026) is inside the latin
unicode-range. The one character that is not — `→` U+2192 — appears exclusively
in code comments, and no Google subset of these families carries it anyway, so it
already fell back to a system font before this change.

Re-add a subset by downloading that `@font-face`'s file (see below) and adding it
to the `src` array with its `unicode-range`.

## Why one file per family covers every weight

All three are variable fonts. The previous config declared 8 discrete faces, but
Google served the **same** binary for every weight of a family — the four
Bricolage weights and the three Fraunces weights each mapped to one file. So
`weight` here is an axis range, not a face list, and dropping the unused weights
cost nothing because they were never separate downloads.

For the record, only 4 of those 8 declared faces ever actually loaded at runtime
(`document.fonts` reported the rest as `unloaded`): Bricolage 600 and 700,
Fraunces 400 italic, Inter's full range. Bricolage 400/800 and Fraunces 500/600
were dead declarations.

## Provenance

Downloaded from Google Fonts' CSS API with a Chrome user-agent (so the woff2
variant is served), taking the `@font-face` whose `unicode-range` begins
`U+0000-00FF`. Each file is **byte-identical** to what `next/font/google` had
been fetching — verified by sha256 against the previous build output, which is
why this migration cannot change rendering.

| File | sha256 | Bytes | Source query |
|---|---|---|---|
| `inter-latin-var.woff2` | `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4` | 48432 | `family=Inter:wght@100..900` |
| `bricolage-grotesque-latin-var.woff2` | `4fd48b2c1ab27220e71f15f990550261b35245c3bdfd8d8025b4bdac0459ee2d` | 41236 | `family=Bricolage+Grotesque:wght@200..800` |
| `fraunces-italic-latin-var.woff2` | `c9745ee907c02cdd46cc41a65bb711cd861432f679a76c18e3de204a18723040` | 45624 | `family=Fraunces:ital,wght@1,100..900` |

To refresh one (e.g. to pick up an upstream release), request the CSS and pull
the latin URL out of it:

```bash
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
  (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
```

The `unicode-range` in that CSS must stay in sync with the subset assumption
above. Without the browser user-agent Google returns TTF instead of woff2.

## Licenses

All three are SIL Open Font License 1.1, which permits redistribution. The
upstream license text is kept alongside the binaries as required:

- `LICENSE-Inter.txt` — Copyright 2020 The Inter Project Authors
- `LICENSE-BricolageGrotesque.txt` — Copyright 2022 The Bricolage Grotesque Project Authors
- `LICENSE-Fraunces.txt` — Copyright 2018 The Fraunces Project Authors
