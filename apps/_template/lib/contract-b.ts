/**
 * contract-b.ts — the row shape of the sb-tune platform PR (B) that
 * packages/data-client/src/database.types.ts does not carry yet:
 * api.client_v1.branding.
 *
 * Declared here, not in data-client, so the UI PR stays inside apps/. Regenerate
 * database.types.ts after B's db push, then delete this file.
 */

/** Contract: `data.clients.branding jsonb`, `api.client_v1.branding`. */
export interface BrandingJson {
  logo_path?: unknown;
  name?: unknown;
  accent?: unknown;
}
