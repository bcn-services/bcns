/**
 * contract-b.ts — row shapes for the sb-tune platform PR (B) that
 * packages/data-client/src/database.types.ts does not carry yet:
 * api.client_v1.branding, api.source_commands_v1, api.jobs_v1.position and the
 * Drive media attributes.
 *
 * Declared here, not in data-client, so this PR stays inside apps/sb. Every
 * assertion to one of these types carries a comment naming the Contract.
 * Regenerate database.types.ts after B's db push, then delete this file.
 */

/** Contract: `data.clients.branding jsonb`, `api.client_v1.branding`. */
export interface BrandingJson {
  logo_path?: unknown;
  name?: unknown;
  accent?: unknown;
}

export type SourceCommandStatus = "queued" | "done" | "failed";

/** Contract: `api.source_commands_v1` (the columns SB reads). */
export interface SourceCommandRow {
  id: string;
  source: string;
  kind: string;
  payload: { item_id?: unknown } | null;
  status: SourceCommandStatus;
  created_at: string;
  done_at: string | null;
}

/** Contract: Drive media attributes `web_content_link` (null when Drive gave none) and `folder_path` ('' = root). */
export interface DriveAttributes {
  web_view_link?: unknown;
  web_content_link?: unknown;
  folder_path?: unknown;
}
