/**
 * session.ts — the one place a page or server action turns a request into
 * "who is this, which client, and are they an owner".
 *
 * Every server action re-runs this. The UI hiding an owner-only button is a
 * convenience, never the check: middleware only proves "signed in with SOME
 * membership", and a member can post to any action they can name.
 *
 * The loaders are wrapped in React `cache` so the layout header and the page
 * body underneath it share one `getUser()` round trip per request.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServerSupabase,
  requireMembership,
  type Membership,
  type MembershipResult,
} from "@bcn-services/tenant";
import type { ClientRow } from "./sources";

/** Every read the hub does goes through the `api` schema's RLS-scoped views. */
function apiSchema(supabase: SupabaseClient) {
  return supabase.schema("api");
}

export type ApiSchema = ReturnType<typeof apiSchema>;

export interface HubSession {
  supabase: SupabaseClient;
  api: ApiSchema;
  membership: Membership;
}

type LoadedSession =
  | { supabase: SupabaseClient; result: MembershipResult }
  | { supabase: null; result: { ok: false; reason: "unconfigured" } };

/**
 * The hub passes no `expectedClientId`: it serves every client and RLS does the
 * scoping. Returns rather than redirects, so the layout can render a signed-out
 * header instead of bouncing /login into itself.
 */
const loadSession = cache(async (): Promise<LoadedSession> => {
  const supabase = createServerSupabase();
  if (!supabase) return { supabase: null, result: { ok: false, reason: "unconfigured" } };
  return { supabase, result: await requireMembership(supabase) };
});

/** The membership, or null when signed out / not configured. Never redirects. */
export async function currentMembership(): Promise<Membership | null> {
  const { result } = await loadSession();
  return result.ok ? result.membership : null;
}

/** Signed in and a member of some client, or a redirect to /login. */
export async function requireHub(): Promise<HubSession> {
  const { supabase, result } = await loadSession();
  if (!supabase || !result.ok) redirect(`/login?error=${result.ok ? "invalid" : result.reason}`);
  return { supabase, api: apiSchema(supabase), membership: result.membership };
}

/**
 * Same, plus `client_role = 'owner'`. A member who posts to an owner-only
 * action lands back on `denyTo` with an error rather than a raw 403 body,
 * because every caller here is a form post, not an API client.
 */
export async function requireOwner(denyTo: string): Promise<HubSession> {
  const session = await requireHub();
  if (session.membership.role !== "owner") redirect(`${denyTo}?error=forbidden`);
  return session;
}

/**
 * The client's own row. `select("*")` on purpose: `app_url` is added by
 * 20260916000100_clients_app_url.sql, and naming it explicitly would make the
 * whole page 400 against a database that has not run that migration yet.
 */
export const loadClient = cache(async (): Promise<ClientRow | null> => {
  const { supabase, result } = await loadSession();
  if (!supabase || !result.ok) return null;
  const { data } = await apiSchema(supabase).from("client_v1").select("*").limit(1).maybeSingle();
  return (data as ClientRow | null) ?? null;
});

/**
 * POST to one of the platform's Edge Functions as the signed-in user. Safe to
 * take the token from the session: `requireHub()` has already had
 * `auth.getUser()` verify it, and the function verifies it again on its side.
 */
export async function callFunction(
  supabase: SupabaseClient,
  name: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!url || !token) return { ok: false, status: 503, json: { error: "unconfigured" } };

  const response = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    // A hung function must not pin the server action; the non-ok branch handles the abort.
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, json };
}
