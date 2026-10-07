/**
 * ai-settings.ts — the "Let AI see customer contact info" switch on /access.
 *
 * The owner check and the revalidate are injected so tests run without Next or a
 * session. The action (app/access/actions.ts) passes the real `requireOwner`, which
 * redirects a member away before any RPC runs; the database re-checks the role too.
 */

export const AI_SETTINGS_FAILED =
  "Couldn't save that setting. Try again, or email bcns.";

/** Minimal shape of the `api` schema client: just `.rpc`. */
export interface AiSettingsApi {
  rpc(
    fn: "get_ai_settings" | "set_ai_settings" | "ai_last_used_at",
    args?: { p_share_customer_contact: boolean }
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

/** Only the literal `on` turns sharing on; missing, `off`, `true`, `1` all mean off. */
export function parseShare(form: FormData): boolean {
  return form.get("share") === "on";
}

export type SaveResult = { ok: true; share: boolean } | { ok: false; message: string };

export interface SaveDeps {
  requireOwner: () => Promise<{ api: AiSettingsApi }>;
  revalidate: () => void;
}

export async function saveShareContact(form: FormData, deps: SaveDeps): Promise<SaveResult> {
  const { api } = await deps.requireOwner();
  const share = parseShare(form);
  try {
    const { error } = await api.rpc("set_ai_settings", { p_share_customer_contact: share });
    if (error) return { ok: false, message: AI_SETTINGS_FAILED };
  } catch {
    return { ok: false, message: AI_SETTINGS_FAILED };
  }
  deps.revalidate();
  return { ok: true, share };
}

/** Current value; a read failure counts as off (the safe side) and says so via `known`. */
export async function readShareContact(
  api: AiSettingsApi
): Promise<{ share: boolean; known: boolean }> {
  try {
    const { data, error } = await api.rpc("get_ai_settings");
    if (error) return { share: false, known: false };
    const share = (data as { share_customer_contact?: unknown } | null)?.share_customer_contact === true;
    return { share, known: true };
  } catch {
    return { share: false, known: false };
  }
}

/**
 * When anyone in this workspace last asked an AI about its data, or null (never, or unreadable).
 * A failure (e.g. the database function is not deployed yet) must neither crash the page nor
 * tick the checklist step, so it reads as null.
 */
export async function readAiLastUsed(api: AiSettingsApi): Promise<string | null> {
  try {
    const { data, error } = await api.rpc("ai_last_used_at");
    if (error) return null;
    return typeof data === "string" && data ? data : null;
  } catch {
    return null;
  }
}
