import { cache } from "react";
import { headers } from "next/headers";
import { createSupabaseServer } from "./supabase";
import { decodeSession, SESSION_HEADER, type Profile, type SessionUser } from "./session-header";

export type { Profile, SessionUser };

/** Asks Supabase itself (getUser() + profiles); never reads the middleware header. */
async function fetchSession(): Promise<{ user: SessionUser | null; profile: Profile | null }> {
  const supabase = createSupabaseServer();
  if (!supabase) return { user: null, profile: null };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { user: null, profile: null };
  const { data: row } = await supabase
    .from("profiles")
    .select("id, handle, role, display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  // untyped client (no generated Database type yet): the select above is the shape
  return { user: data.user, profile: (row as Profile | null) ?? null };
}

/** For a caller with no RLS behind it (the files route): never trusts the header, so it holds even if middleware is skipped. */
export const getVerifiedSession = cache(fetchSession);

/**
 * The signed-in user and their `profiles` row (null when absent). Cached per request. When the middleware
 * already validated both (it runs on every route that calls this) it forwards them in SESSION_HEADER and this
 * skips the second getUser() + profiles round trips; without the header it asks Supabase itself. Callers that
 * read through RLS can use this; a forged header there yields a shell, never rows.
 */
export const getSession = cache(
  async () => decodeSession(headers().get(SESSION_HEADER)) ?? (await fetchSession())
);
