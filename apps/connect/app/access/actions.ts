"use server";

import { callFunction, requireOwner } from "@/lib/session";

export type MintResult =
  | { ok: true; email: string; password: string }
  | { ok: false; message: string };

/**
 * Mints (or rotates) this client's agent login through the `mint-agent-login`
 * Edge Function. The password is returned to the caller and never persisted
 * anywhere on this side — not in a cookie, not in a URL, not in a log.
 *
 * Owner-only, re-checked here and again inside the function, because a client
 * component can call a server action directly with no form in between.
 */
export async function mintAgentLogin(): Promise<MintResult> {
  const { supabase } = await requireOwner("/");
  const result = await callFunction(supabase, "mint-agent-login", {});
  const email = result.json.email;
  const password = result.json.password;
  if (!result.ok || typeof email !== "string" || typeof password !== "string") {
    return {
      ok: false,
      message:
        result.status === 503
          ? "Agent logins aren't configured for this app yet."
          : "Couldn't mint an agent login. Try again, or email bcns.",
    };
  }
  return { ok: true, email, password };
}
