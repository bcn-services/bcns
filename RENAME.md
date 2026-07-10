# RENAME — replacing the placeholder name

The business name isn't chosen yet, so `acme-labs` is used everywhere as a
placeholder. This file lists **every** place it appears so you can find-and-
replace once you pick a real name.

## Three string forms to replace

There are three distinct casings/forms. Replace them in this order:

| # | Find | Meaning | Replace with (example) |
| - | ---- | ------- | ---------------------- |
| 1 | `@acme-labs/` | npm package scope (in `package.json` deps, imports, config paths) | `@brightbench/` |
| 2 | `acme-labs` | repo/package name, domain, kebab-case copy | `brightbench` |
| 3 | `Acme Labs` | human-readable brand name in UI copy + metadata | `BrightBench` |

> Do **not** blindly replace `acme` alone — always include the full token to
> avoid touching unrelated words.

### One-liner (from the repo root)

```bash
# Preview matches first:
grep -rIl --exclude-dir={node_modules,.next,.turbo,.git} \
  -e '@acme-labs/' -e 'acme-labs' -e 'Acme Labs' .

# Then replace (macOS/BSD sed shown; adjust NEW values):
grep -rIl --exclude-dir={node_modules,.next,.turbo,.git} \
  -e '@acme-labs/' -e 'acme-labs' -e 'Acme Labs' . \
| xargs sed -i '' \
    -e 's/@acme-labs\//@brightbench\//g' \
    -e 's/acme-labs/brightbench/g' \
    -e 's/Acme Labs/BrightBench/g'
```

After replacing, run `pnpm install` again (package names changed) and
`pnpm lint && pnpm build` to confirm everything still resolves. Also **rename
the repo directory itself** (`acme-labs/`) if you like — nothing depends on the
folder name.

## Where the name appears (by category)

### Package names & scope (`@acme-labs/*`, `acme-labs`)

- `package.json` → root package `name: "acme-labs"`
- `packages/config/package.json` → `name: "@acme-labs/config"`
- `packages/ui/package.json` → `name: "@acme-labs/ui"` (+ comment in `src/styles.css`)
- `apps/web/package.json` → `name: "@acme-labs/web"` + workspace deps
  `@acme-labs/ui`, `@acme-labs/config`

### Config wiring (import/extends specifiers)

- `prettier.config.mjs` → `export ... from "@acme-labs/config/prettier"`
- `packages/ui/tsconfig.json` → `extends "@acme-labs/config/tsconfig/react-library.json"`
- `packages/ui/eslint.config.mjs` → `import ... "@acme-labs/config/eslint/base"`
- `apps/web/tsconfig.json` → `extends "@acme-labs/config/tsconfig/nextjs.json"`
- `apps/web/eslint.config.mjs` → `import ... "@acme-labs/config/eslint/next"`
- `apps/web/tailwind.config.ts` → `import preset from "@acme-labs/config/tailwind"`
- `apps/web/next.config.mjs` → `transpilePackages: ["@acme-labs/ui"]`
- `apps/web/components/*` and `app/*` → imports from `@acme-labs/ui`

### Site copy & metadata (`Acme Labs`, domain, email)

- `apps/web/lib/site.ts` → `name: "Acme Labs"`, `domain: "acme-labs.com"`,
  `email: "hello@acme-labs.com"` (all marked with TODOs)
- `apps/web/app/layout.tsx` → metadata title/description pull from `siteConfig`
- Rendered brand text in `components/site-header.tsx` and
  `components/site-footer.tsx` (via `siteConfig.name`)

### Docs & tooling

- `README.md` → title, description, all `@acme-labs/*` references
- `.env.example` comments (Web3Forms/Formspree instructions)
- This file (`RENAME.md`)

## Related TODOs (real content to supply)

The name is a placeholder; these are separate real-content gaps, all grep-able
via `TODO`:

- `apps/web/lib/site.ts` — real domain + support email
- `apps/web/components/use-cases.tsx` — swap placeholder examples for real case studies
- `apps/web/components/site-footer.tsx` — real Privacy/Terms pages
