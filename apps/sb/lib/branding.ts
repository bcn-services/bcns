/**
 * branding.ts — per-client logo, name and favicon, read generically from
 * api.client_v1.branding (`{logo_path?, name?, favicon_path?, accent?}`, files in the
 * public `branding` bucket under `<client_id>/`). Null branding, or a read that
 * fails because the platform change is not deployed yet, means the text
 * fallback: the app's own title and no logo.
 *
 * Same file ships in apps/_template; keep them in step.
 */

import type { DataClient, Database } from "@bcn-services/data-client";

type ClientRow = Database["api"]["Views"]["client_v1"]["Row"];

export interface Branding {
  name: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
}

/** A bucket-relative path: no scheme, no leading slash, no `..`. */
const SAFE_PATH = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function brandingPublicUrl(supabaseUrl: string | undefined, path: string): string | null {
  if (!supabaseUrl || !SAFE_PATH.test(path)) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/branding/${path}`;
}

/** Null when the client has no branding row value; otherwise whatever it names. */
export function resolveBranding(
  row: Partial<Pick<ClientRow, "client_id" | "branding">> | null | undefined,
  supabaseUrl: string | undefined,
): Branding | null {
  const raw = row?.branding;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // branding is free-form jsonb: every field is checked below, not trusted.
  const b = raw;
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : null;
  const logoUrl = typeof b.logo_path === "string" ? brandingPublicUrl(supabaseUrl, b.logo_path) : null;
  // favicon_path wins when present and safe; otherwise the conventional <client_id>/favicon.png.
  const faviconUrl =
    (typeof b.favicon_path === "string" ? brandingPublicUrl(supabaseUrl, b.favicon_path) : null) ??
    (row?.client_id ? brandingPublicUrl(supabaseUrl, `${row.client_id}/favicon.png`) : null);
  return { name, logoUrl, faviconUrl };
}

/** Never throws: a failed read (column or view field not deployed yet) is "no branding". */
export async function loadBranding(client: DataClient, supabaseUrl: string | undefined): Promise<Branding | null> {
  try {
    const { data, error } = await client.views.client_v1("client_id,branding").single();
    if (error || !data) return null;
    return resolveBranding(data, supabaseUrl);
  } catch {
    return null;
  }
}

/** Document title from the branding name, favicon from the bucket; `fallback` when unset. */
export function brandingMetadata<T extends { title?: unknown }>(branding: Branding | null, fallback: T): T & { icons?: { icon: string } } {
  if (!branding) return fallback;
  return {
    ...fallback,
    ...(branding.name ? { title: branding.name } : {}),
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {}),
  };
}
