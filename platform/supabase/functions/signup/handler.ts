/**
 * signup — owner self-service sign-up (P1). Public: no caller JWT exists yet, so the
 * function is deployed with --no-verify-jwt and every limit lives here and in the database.
 *
 *   1. create the auth user (admin API, unconfirmed, NO password — hosted public sign-ups stay OFF).
 *      Taking no password is the pre-hijack fix: whoever proves inbox ownership by clicking the
 *      confirmation link sets the password on the hub's /set-password. A `password` in the body is
 *      ignored, not rejected, so a stale client still gets the same 200;
 *   2. api.signup_create_client: the pending client + owner membership, one transaction,
 *      capped per rolling hour (BCNS8);
 *   3. ask GoTrue to send its own confirmation email, which lands on the hub's /auth/confirm.
 *
 * Step 2 failing deletes the user from step 1, so no orphan auth user is left behind. Mail is
 * only sent after step 2 succeeds, so the database cap bounds mail too.
 *
 * Dark by default: unless the function secret SIGNUP_ENABLED is `1`, every request answers 404
 * before anything else runs (the hub's SIGNUP_ENABLED only shows the page; this is the real switch).
 *
 * No email enumeration: an address that already has an account, a capped window and a fresh
 * sign-up all answer the same 200 ACCEPTED body. Only malformed input (independent of whether
 * the address exists) and a server fault on a NEW address answer differently.
 */

import { json } from "../_shared/guard.ts";

/** Where the confirmation email's link lands: the hub's token-verifying route (type=email). */
export const SIGNUP_REDIRECT = "https://connect.bcn-services.com/auth/confirm";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

/** Same loose shape as invite-member: GoTrue is the real validator. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ACCEPTED = { ok: true } as const;

export interface SignupDeps {
  /** Function secret SIGNUP_ENABLED === "1". False = 404, nothing called. */
  enabled: boolean;
  /** userId null = not created (most often: the address already has an account). */
  createUser(email: string): Promise<{ userId: string | null; error?: string }>;
  /** api.signup_create_client. Throws with `code` set to the SQLSTATE on failure. */
  createClient(userId: string, name: string): Promise<string>;
  deleteUser(userId: string): Promise<void>;
  sendConfirmation(email: string, redirectTo: string): Promise<{ error?: string }>;
  /** Event + ids only — never the email or the request body. */
  log(event: string, data: Record<string, unknown>): void;
}

export async function handle(request: Request, deps: SignupDeps): Promise<Response> {
  if (!deps.enabled) return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || name.length > MAX_NAME_LENGTH) return json({ error: "invalid_name" }, 400);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) return json({ error: "invalid_email" }, 400);

  const created = await deps.createUser(email);
  if (!created.userId) {
    // Every createUser refusal answers the same 200. Never map a GoTrue validation
    // error to 400: it checks for a duplicate email first, so that would leak existence.
    deps.log("signup_not_created", { reason: created.error ?? "unknown" });
    if (created.error === "email_exists") {
      // Re-send the confirmation: GoTrue /resend is a no-op for confirmed or unknown users and has its
      // own per-user rate limit, so a lost mail is recoverable without creating anything.
      try {
        const sent = await deps.sendConfirmation(email, SIGNUP_REDIRECT);
        if (sent.error) deps.log("signup_resend_failed", {});
      } catch {
        deps.log("signup_resend_failed", {});
      }
    }
    return json(ACCEPTED, 200);
  }

  let slug: string;
  try {
    slug = await deps.createClient(created.userId, name);
  } catch (error) {
    const code = (error as { code?: string }).code;
    try {
      await deps.deleteUser(created.userId);
    } catch {
      deps.log("signup_orphan_user", { userId: created.userId });
    }
    deps.log("signup_client_failed", { userId: created.userId, code: code ?? "unknown" });
    // The cap answers like success so it cannot be told apart from an existing address.
    return code === "BCNS8" ? json(ACCEPTED, 200) : json({ error: "signup_failed" }, 502);
  }

  const sent = await deps.sendConfirmation(email, SIGNUP_REDIRECT);
  if (sent.error) deps.log("signup_mail_failed", { userId: created.userId, slug });
  deps.log("signup_created", { userId: created.userId, slug });
  return json(ACCEPTED, 200);
}
