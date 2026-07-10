# templates/

Reserved for **future app starters** — the reusable skeletons we'll clone when
kicking off a new client build.

Nothing lives here yet. The intent is that each subdirectory becomes a
copy-pasteable starting point for a common delivery shape, for example:

- `templates/web-app/` — an installable web app (Next.js) preconfigured with the
  shared `@acme-labs/config` and `@acme-labs/ui` packages.
- `templates/desktop-app/` — a downloadable desktop app shell.
- `templates/dashboard/` — an internal-tools / admin dashboard starter.

These are **not** workspace packages (the root `pnpm-workspace.yaml` only globs
`apps/*` and `packages/*`), so anything added here stays out of the install
graph until it's promoted into `apps/`.

> TODO: add the first starter once we've shipped a client project worth
> templatizing.
