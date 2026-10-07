/**
 * signup.ts — the pure halves of self-service sign-up (P1). The page, its action and the
 * /auth/confirm hook are thin wrappers; everything here takes its deps so the tests need no
 * network.
 *
 * The account itself is made by the public `signup` Edge Function (platform/supabase/functions/
 * signup): it owns the service-role key, the no-orphan rollback and the hourly cap. This file
 * only forwards the form and maps the answer onto a redirect.
 */

import { requireMembership } from "@bcn-services/tenant";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BCNS_EMAIL, REQUEST_FROM, sendMail, type RequestDeps, type ResendEmail } from "./request-connection";

export const SIGNUP_PATH = "/signup";
export const PENDING_PATH = "/pending";
export const SIGNUP_SENT_PATH = `${SIGNUP_PATH}?ok=check-email`;
/** notifySignupConfirmed only fires when the address was confirmed this recently. */
const NOTICE_WINDOW_MS = 10 * 60 * 1000;

export interface SignupForm {
  name: string;
  email: string;
}

export interface SignupDeps {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Where the browser goes after a submit. A fresh address, one that already has an account,
 * and a capped window all come back from the function as the same 200, so all three land on
 * the same "check your email" page; this layer cannot tell them apart either.
 */
export async function signupTarget(form: SignupForm, deps: SignupDeps): Promise<string> {
  const { supabaseUrl, supabaseAnonKey, fetchImpl = fetch } = deps;
  if (!supabaseUrl || !supabaseAnonKey) return `${SIGNUP_PATH}?error=unconfigured`;
  const name = form.name.trim();
  const email = form.email.trim();
  if (!name || !email) return `${SIGNUP_PATH}?error=invalid`;
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/signup`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return SIGNUP_SENT_PATH;
    if (response.status === 400) return `${SIGNUP_PATH}?error=invalid`;
    console.error(`signup: edge function answered ${response.status}`);
  } catch {
    // unreachable or timed out: same answer as a 5xx
  }
  return `${SIGNUP_PATH}?error=failed`;
}

export function signupNotice(ownerEmail: string): ResendEmail {
  return {
    from: REQUEST_FROM,
    to: [BCNS_EMAIL],
    reply_to: ownerEmail,
    subject: `New bcns Connect sign-up: ${ownerEmail}`,
    text: [
      `${ownerEmail} confirmed their email. Their workspace is pending until you activate it.`,
      "",
      "Find the slug (Supabase SQL editor):",
      `  select c.slug, c.name from data.clients c join data.memberships m on m.client_id = c.id join auth.users u on u.id = m.user_id where u.email = '${ownerEmail.replace(/'/g, "''")}';`,
      "Then run: pnpm --filter @bcn-services/platform exec tsx scripts/activate-client.ts --slug <slug>",
    ].join("\n"),
  };
}

/**
 * After /auth/confirm verified a link: one notice to bcns when the session that link just
 * created is a pending sign-up. verifyOtp is single-use, so a re-clicked link fails before
 * this and a confirmed sign-up is announced once. Never throws; false = nothing sent.
 */
export async function notifySignupConfirmed(
  supabase: Pick<SupabaseClient, "auth"> | null,
  deps: RequestDeps
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const result = await requireMembership(supabase as SupabaseClient);
    if (result.ok || !result.pending) return false;
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    // Only the click that just confirmed the address: a later type=email verify (e.g. a magic link)
    // by a still-pending user must not notify bcns again.
    const confirmedAt = Date.parse(data.user?.email_confirmed_at ?? "");
    if (!email || !(Date.now() - confirmedAt < NOTICE_WINDOW_MS)) return false;
    return await sendMail(signupNotice(email), "signup confirmed", deps);
  } catch {
    return false;
  }
}
