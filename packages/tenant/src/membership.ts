/**
 * membership.ts — who is signed in, which client they belong to, and whether
 * this app will serve them.
 *
 * The platform's `custom_access_token_hook`
 * (platform/supabase/migrations/20260912000200_access.sql) puts `client_id`
 * and `client_role` at the TOP LEVEL of the access token's claims — the same
 * place `data.jwt_client_id()` reads them from. They are not part of the user
 * record GoTrue returns from `/auth/v1/user`, so `auth.getUser()` alone cannot
 * see them: we verify with `getUser()` and then read the claims out of that
 * same verified token.
 *
 * Edge-safe: no `next/headers`, no node builtins.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface Membership {
  userId: string;
  email: string | null;
  clientId: string;
  role: "member" | "owner";
}

export interface RequireMembershipOptions {
  /** Client apps pin themselves to one client id; the hub leaves it unset. */
  expectedClientId?: string;
}

export type MembershipResult =
  | { ok: true; membership: Membership }
  | { ok: false; reason: "signed-out" | "no-membership" | "wrong-client" };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pull the membership out of a verified user's claims.
 *
 * Accepts the claim bag either at the top level (where the access token hook
 * writes it) or under `app_metadata`, so a future move of the claims into
 * `app_metadata` needs no caller change. Returns null when either claim is
 * missing or the role is not one `data.member_role` allows — callers treat
 * null as "deny", never as "allow".
 *
 * NOTE: a bare `User` straight from `auth.getUser()` carries no token claims
 * and will always read as null here. Use `requireMembership`, which overlays
 * the verified token's claims first.
 */
export function membershipFromUser(user: User | null): Membership | null {
  if (!user) return null;
  const bag = user as unknown as Record<string, unknown>;
  const meta = (bag.app_metadata ?? {}) as Record<string, unknown>;
  const userId = asString(bag.id) ?? asString(bag.sub);
  const clientId = asString(bag.client_id) ?? asString(meta.client_id);
  const role = asString(bag.client_role) ?? asString(meta.client_role);
  if (!userId || !clientId) return null;
  if (role !== "member" && role !== "owner") return null;
  return { userId, email: asString(bag.email), clientId, role };
}

/**
 * Decode a JWT payload. Decode-only and unverified by design: the only caller
 * has already had `auth.getUser()` verify this exact token with the auth
 * server. Mirrors `decodeClientId` in @bcn-services/data-client, but on
 * `atob`/`TextDecoder` rather than `Buffer`, which the edge runtime lacks.
 */
function claimsFromToken(accessToken: string | undefined): Record<string, unknown> {
  const segment = accessToken?.split(".")[1];
  if (!segment) return {};
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    // A malformed token reads as no claims, which denies rather than allows.
    return {};
  }
}

/**
 * Gate one request. `getUser()` verifies the token against the auth server
 * (and refreshes it) — the session is only ever used afterwards to read the
 * claims out of that already-verified token, never as the sole source of
 * identity.
 */
export async function requireMembership(
  supabase: SupabaseClient,
  opts: RequireMembershipOptions = {}
): Promise<MembershipResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = claimsFromToken(session?.access_token);
  const membership = membershipFromUser({ ...user, ...claims } as User);
  if (!membership) return { ok: false, reason: "no-membership" };

  if (opts.expectedClientId && membership.clientId !== opts.expectedClientId) {
    return { ok: false, reason: "wrong-client" };
  }
  return { ok: true, membership };
}
