# TEMPLATE.md — customization manifest

The single list of everything that changes when this template becomes
`apps/<slug>`. `scripts/new-app.sh <slug> <port>` (run from the repo root, or
via the `/new-client-app` skill) applies every "Required at creation" row
below automatically — this file documents what it does, not a manual
checklist.

The template itself stays fully runnable with generic values — no `{{TOKEN}}`
placeholders, so `corepack pnpm --filter @bcn-services/_template build test`
is always green here.

## Required at creation (stamped by `scripts/new-app.sh <slug> <port>`)

| File | What changes | Example (slug `coventry-hills`, port `3110`) |
| --- | --- | --- |
| `package.json` | `"name"`: `@bcn-services/_template` → `@bcn-services/<slug>` | `@bcn-services/coventry-hills` |
| `app/layout.tsx` | `metadata.title` → the slug title-cased | `title: "Coventry Hills"` |
| `app/page.tsx` | The `<h1>` heading → the slug title-cased | `<h1>Coventry Hills</h1>` |
| `CLIENT.md` | Created (not in the template): display name, slug, port, open questions | — |
| `infra/ports.txt` | `<slug> <port>` appended, kept sorted by port | `coventry-hills 3110` |
| `README.md` / `CLAUDE.md` | Not stamped — ship as-is (generic app orientation, reference `CLIENT.md`/`TEMPLATE.md`/`DEPLOY.md`). Add a client-specific `STANDARDS.md` once real code patterns emerge. | — |

## Config decisions (per-client; template default applies until decided)

| Decision | Where it lands | Template default |
| --- | --- | --- |
| Tenant pin | `EXPECTED_CLIENT_ID` in the deploy env (`/srv/<slug>/env`), set by the operator from `clients.id` — `@bcn-services/tenant`'s middleware rejects a session whose membership doesn't match | Required. Unset with the platform configured = middleware DENIES every request (fails closed, R39); unset with no platform env = local dev, passes through |
| Storage backend | `lib/storage.ts` — implement and return the adapter in `getStorageAdapter()` | `null` (file features off); platform default is Supabase Storage, WebDAV the documented alternative |
| AI feature | `AI_ENABLED` in `.env.example` note + per-deploy env | Off (`maybeGetAiClient` returns null) |
| Webhook providers | Provider routes under `app/api/`, wired through `lib/webhooks.ts` seams | None ship; fail-closed `unverifiedVerifier` |

## Not changed at creation

- `.env.example` — values are per-deploy secrets, filled at deploy time
  (platform Supabase project keys, `EXPECTED_CLIENT_ID`, smoke/agent logins,
  optional Anthropic BYOK key). Never real values in git.
- `tests/rls-forbidden-read.test.mjs` — standing scaffold; extend per
  protected table/role as the schema grows.
- There is no `supabase/migrations/` — `platform/` owns the schema for every
  app on the shared platform.
