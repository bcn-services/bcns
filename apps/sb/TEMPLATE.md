# TEMPLATE.md — customization manifest

The single list of everything that changes when this template becomes a client
repo. The `/new-client-repo` skill reads this file and applies each entry;
doing it by hand, this is your checklist. Keep it current: any new
client-varying spot added to the template MUST get an entry here.

The template itself stays fully runnable with generic values — no `{{TOKEN}}`
placeholders, so `pnpm build && pnpm test` is always green here.

## Required at creation (identity stamps)

| File | What to change | Example (client "Coventry Hills", slug `coventry-hills`) |
| --- | --- | --- |
| `package.json` | `"name"`: `@bcn-services/hosted-web-template` → `@bcn-services/bcns-client-<slug>` | `@bcn-services/bcns-client-coventry-hills` |
| `app/layout.tsx` | `metadata.title` / `metadata.description` → client display name | `title: "Coventry Hills"` |
| `app/page.tsx` | The `<h1>` heading and intro copy → client display name | `<h1>Coventry Hills</h1>` |
| `README.md` | Title line + first paragraph → client name; delete the "Use this template" blockquote | `# coventry-hills — hosted client app` |
| `CLIENT.md` | Create it (not in the template): display name, business brief, config decisions below — undecided ones listed as open questions | — |
| `CLAUDE.md` | Not stamped — ships as-is from the template (generic repo orientation, references `CLIENT.md`/`TEMPLATE.md`/`DEPLOY.md`). Add a client-specific `STANDARDS.md` once real code patterns emerge; `CLAUDE.md` points there but doesn't write it. | — |

## Config decisions (per-client; template default applies until decided)

| Decision | Where it lands | Template default |
| --- | --- | --- |
| Data source | `DATA_SOURCE` in the deploy env (`/srv/<slug>/env`) and repo variable `DATA_SOURCE`. `shared` also: delete `supabase/migrations/`, set `HEALTH_EMAIL`/`HEALTH_PASSWORD`, read data only via `lib/data.ts` (see `DEPLOY.md` "Shared-platform mode") | Unset = own Supabase project |
| Storage backend | `lib/storage.ts` — implement and return the adapter in `getStorageAdapter()` | `null` (file features off); platform default is Supabase Storage, WebDAV the documented alternative |
| AI feature | `AI_ENABLED` in `.env.example` note + per-deploy env | Off (`maybeGetAiClient` returns null) |
| Webhook providers | Provider routes under `app/api/`, wired through `lib/webhooks.ts` seams | None ship; fail-closed `unverifiedVerifier` |
| Shape | app + agent (default): ship as-is. app-only: delete `agent/`, the `agent` script, and `AGENT_*` from `.env.example`. agent-only: delete `app/`, `middleware.ts`, the Next.js config and dependencies, keep `lib/env.ts`, `lib/ai.ts`, and `agent/` | app + agent |

## Not changed at creation

- `.env.example` — values are per-deploy secrets, filled at deploy time
  (Supabase project keys, optional Anthropic BYOK key). Never real values in git.
- `supabase/migrations/` — starts empty; client schema arrives with development.
  Shared-platform clients delete it (the platform owns the schema).
- `tests/rls-forbidden-read.test.mjs` — standing scaffold; extend per protected
  table/role as the schema grows.
