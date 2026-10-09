# Self-hosted fonts

`app/layout.tsx` loads Inter Tight via `next/font/local`. Never switch to the
Google-fetching variant of next/font: it fetches at build time with no timeout in
production, so an unreachable Google CDN fails `next build` in CI (see `apps/web/app/fonts/README.md`).

| File | Family | Weights | CSS var |
|---|---|---|---|
| `inter-tight-latin-var.woff2` | Inter Tight (variable `wght`) | 400-700 | `--font-inter-tight` |

One variable file covers all four weights the app uses (400/500/600/700). Google
serves this same binary for each static weight, so four files would be larger.

## Provenance

Google Fonts CSS API (`family=Inter+Tight:wght@400..700`, Chrome user-agent so
woff2 is served), `@font-face` whose `unicode-range` begins `U+0000-00FF`
(latin). Fetched 2026-10-08.

- URL: `https://fonts.gstatic.com/s/intertight/v9/NGSwv5HMAFg6IuGlBNMjxLsH8ahuQ2e8.woff2` (v9)
- sha256: `83d548cd73ef2e039167db3adb5ea9d7a7870466ffc8a162c9820bc348938aaf`
- Bytes: 44916

## License

SIL Open Font License 1.1, Copyright 2022 The Inter Project Authors. Text in
`OFL.txt` (from `google/fonts` `ofl/intertight/OFL.txt`).
