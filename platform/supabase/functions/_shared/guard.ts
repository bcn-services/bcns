/**
 * guard.ts — who may call a privileged Edge Function.
 *
 * These functions hold the service-role key, which is exactly why the caller
 * check cannot be sloppy: the key bypasses RLS, so every scoping decision has
 * to be made here, in code, from a token the auth server has verified.
 *
 * The one rule that matters: `clientId` is read from the CALLER'S OWN
 * membership, never from the request body. An owner of client A can therefore
 * only ever write into client A, whatever they post.
 *
 * Pure: no Deno globals, no imports. The real Supabase wiring is injected by
 * _shared/deps.ts so this file (and the handlers) run under vitest on node.
 */

export interface Caller {
  userId: string;
  email: string | null;
}

export interface CallerMembership {
  clientId: string;
  role: string;
}

export interface GuardDeps {
  /** Verify a bearer token with the auth server (anon client + getUser). */
  getUser(accessToken: string): Promise<Caller | null>;
  /** Read the caller's own row from api.memberships_v1 with the caller's JWT (RLS-scoped). */
  getMembership(userId: string): Promise<CallerMembership | null>;
}

export type Guarded =
  | { ok: true; userId: string; email: string | null; clientId: string }
  | { ok: false; response: Response };

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The raw JWT from `Authorization: Bearer <jwt>`, or null. */
export function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** 401 when we don't know who you are; 403 when we do and you aren't an owner. */
export async function requireOwner(request: Request, deps: GuardDeps): Promise<Guarded> {
  const token = bearer(request);
  if (!token) return { ok: false, response: json({ error: "unauthorized" }, 401) };

  const caller = await deps.getUser(token);
  if (!caller) return { ok: false, response: json({ error: "unauthorized" }, 401) };

  const membership = await deps.getMembership(caller.userId);
  if (!membership) return { ok: false, response: json({ error: "forbidden" }, 403) };
  if (membership.role !== "owner") {
    return { ok: false, response: json({ error: "forbidden_role" }, 403) };
  }

  return { ok: true, userId: caller.userId, email: caller.email, clientId: membership.clientId };
}
