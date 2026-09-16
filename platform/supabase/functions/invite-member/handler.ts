/**
 * invite-member — an owner invites someone into their own client.
 *
 * Pure `handle(req, deps)`: every side effect is a dep, so the whole policy
 * (401 / 403 / 400 / the client-id source) is testable on node without Deno,
 * without a database and without the service-role key. index.ts is the only
 * file that knows about Deno.
 */

import { json, requireOwner, type GuardDeps } from "../_shared/guard.ts";

/** Where the invite email's link lands: the hub's sign-in page. */
export const INVITE_REDIRECT = "https://connect.bcn-services.com/login";

/** Deliberately loose. GoTrue is the real validator; this only rejects nonsense. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteDeps extends GuardDeps {
  inviteUser(email: string, redirectTo: string): Promise<{ userId: string | null; error?: string }>;
  /** Re-inviting someone who already has an account must still add the membership. */
  findUserByEmail(email: string): Promise<string | null>;
  insertMembership(userId: string, clientId: string, role: "member"): Promise<void>;
}

export async function handle(request: Request, deps: InviteDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await requireOwner(request, deps);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return json({ error: "invalid_email" }, 400);

  const invited = await deps.inviteUser(email, INVITE_REDIRECT);
  // An existing user makes inviteUserByEmail fail; that is the idempotent path,
  // not an error — look the account up and (re-)attach the membership.
  const userId = invited.userId ?? (await deps.findUserByEmail(email));
  if (!userId) return json({ error: invited.error ?? "invite_failed" }, 502);

  // guard.clientId, never anything from `body`: an owner of A cannot write into B.
  await deps.insertMembership(userId, guard.clientId, "member");

  return json({ ok: true, userId, email, invited: invited.userId !== null }, 200);
}
