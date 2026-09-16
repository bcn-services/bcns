/**
 * mint-agent-login — an owner mints (or rotates) their client's agent login.
 *
 * Mirrors `platform/scripts/add-member.ts --agent`: the address is derived from
 * the client's slug, the role is always `member`, `is_smoke` is always false,
 * and re-running rotates the password. Nothing about the account is taken from
 * the request body, so there is no input to abuse.
 *
 * Pure `handle(req, deps)` — see invite-member/handler.ts for why.
 */

import { json, requireOwner, type GuardDeps } from "../_shared/guard.ts";

/** Same convention as add-member.ts --agent. */
export function agentEmail(slug: string): string {
  return `agent+${slug}@bcn-services.com`;
}

/** 32 base32-ish characters from the CSPRNG. Web Crypto exists in Deno and node 22. */
export function randomPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export interface MintDeps extends GuardDeps {
  getClientSlug(clientId: string): Promise<string | null>;
  /** Create the agent user, or set a new password on the existing one. */
  upsertUser(email: string, password: string): Promise<{ userId: string | null; error?: string }>;
  insertMembership(
    userId: string,
    clientId: string,
    role: "member",
    isSmoke: boolean
  ): Promise<void>;
  randomPassword(): string;
}

export async function handle(request: Request, deps: MintDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await requireOwner(request, deps);
  if (!guard.ok) return guard.response;

  const slug = await deps.getClientSlug(guard.clientId);
  if (!slug) return json({ error: "client_not_found" }, 500);

  const email = agentEmail(slug);
  const password = deps.randomPassword();
  const upserted = await deps.upsertUser(email, password);
  if (!upserted.userId) return json({ error: upserted.error ?? "mint_failed" }, 502);

  // Always `member`, always is_smoke=false — an agent is never an owner, and
  // never the smoke user that api.remove_member refuses to delete.
  await deps.insertMembership(upserted.userId, guard.clientId, "member", false);

  // The only time this password is ever readable. Nothing stores it.
  return json({ email, password }, 200);
}
