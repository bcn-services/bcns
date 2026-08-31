# Self-hosted fonts

Two families, loaded by `app/layout.tsx` via `next/font/local`:

| Role | Family | Weights | CSS var | Tailwind |
|---|---|---|---|---|
| Body | Manrope | 300–600 | `--font-sans` | `font-sans` |
| Headings, eyebrows, labels, numerals | Space Grotesk | 400–700 | `--font-display` | `font-display` |

## Never use `next/font/google`

`next/font/google` fetches over the network **at build time**, not at runtime:

- In dev each fetch is aborted after a hard-coded 3000ms and retried, which
  produces `The user aborted a request. / Retrying 1/3...` spam and seconds of
  every cold compile. It is not network-speed related — Google answers in ~70ms;
  the 3s budget is spent competing with webpack for the event loop.
- In a **production** build there is no abort timeout at all. After 3 failed
  retries it throws, so `next build` *fails* if fonts.googleapis.com is
  unreachable. There is no cache that survives a clean checkout and no
  documented opt-out, so CI would carry a hard dependency on Google's CDN.

Self-hosting removes the network from both dev and CI.

## Why one file per family

Both are variable fonts, so a single binary covers the whole weight axis — the
`weight` values in `layout.tsx` are axis ranges, not face lists.

Only the latin subset is shipped. `subsets: ["latin"]` in `next/font/google`
does **not** limit what gets downloaded; it only controls what gets
`rel=preload`. Every character in the site's rendered copy (`—` U+2014,
`·` U+00B7, `©` U+00A9, `→` U+2192) is inside the latin `unicode-range` these
files carry.

## Provenance

Downloaded from Google Fonts' CSS API with a Chrome user-agent (so the woff2
variant is served, not TTF), taking the `@font-face` whose `unicode-range`
begins `U+0000-00FF`.

| File | sha256 | Bytes | Source query |
|---|---|---|---|
| `manrope-latin-var.woff2` | `e310b55a7fd9677f5e3555e6c6c4d064fa1f1d24393f0ddbe217cea12a8c432f` | 24576 | `family=Manrope:wght@200..800` |
| `space-grotesk-latin-var.woff2` | `a0d054c4af557de20afd6ca59f47ab353bcaec49c63ff04b6c9d39d0f8910557` | 22320 | `family=Space+Grotesk:wght@300..700` |

To refresh one, request the CSS and pull the latin URL out of it:

```bash
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
  (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap"
```

Without the browser user-agent Google returns TTF instead of woff2.

## Licenses

Both are SIL Open Font License 1.1, which permits redistribution. The upstream
license text is kept alongside the binaries as required:

- `LICENSE-Manrope.txt` — Copyright 2018 The Manrope Project Authors
- `LICENSE-SpaceGrotesk.txt` — Copyright 2020 The Space Grotesk Project Authors
