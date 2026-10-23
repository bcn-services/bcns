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
import type { HubConfig } from "./env";
import { BCNS_EMAIL, REQUEST_FROM, sendMail, type RequestDeps, type ResendEmail } from "./request-connection";
import { signupCheckoutTarget, stripeReady } from "./stripe-billing";

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

/* ---------------------------------------------------------------- pay-first */

/** One Checkout per address per this long. */
export const CHECKOUT_COOLDOWN_MS = 10 * 60 * 1000;
const NAME_MAX = 100;
const EMAIL_MAX = 254;
/** Same loose shape as the signup function: Stripe and GoTrue are the real validators. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "At most one Checkout session per email per 10 minutes." `once` keys on the lowercased address
 * and remembers the in-flight/finished Checkout URL, so a double-click or a visitor who backed
 * out of Stripe and tries again gets the SAME URL back instead of a second session (or a dead end).
 * A failed attempt (no URL) is forgotten so the visitor can retry at once.
 * ponytail: per-process Map, valid because the droplet runs one `bcns-app@connect` process and it
 * resets on restart — move to a table (or Stripe idempotency) if the hub ever runs two processes.
 */
export function createCheckoutLimiter(now: () => number = Date.now) {
  const entries = new Map<string, { at: number; url: Promise<string | null> }>();
  return {
    once(email: string, make: () => Promise<string | null>): Promise<string | null> {
      const t = now();
      for (const [key, e] of entries) if (t - e.at >= CHECKOUT_COOLDOWN_MS) entries.delete(key);
      const key = email.toLowerCase();
      const hit = entries.get(key);
      if (hit) return hit.url;
      const url = make().then(
        (u) => (u ? u : (entries.delete(key), u)),
        (e) => {
          entries.delete(key);
          throw e;
        }
      );
      entries.set(key, { at: t, url });
      return url;
    },
  };
}
export type CheckoutLimiter = ReturnType<typeof createCheckoutLimiter>;
const defaultLimiter = createCheckoutLimiter();

/** The `/signup?confirm=1&...` view that shows the typed address back, or an error path. */
export function signupConfirmPath(form: SignupForm): string {
  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();
  if (!name || name.length > NAME_MAX || email.length > EMAIL_MAX || !EMAIL.test(email)) return `${SIGNUP_PATH}?error=invalid`;
  return `${SIGNUP_PATH}?${new URLSearchParams({ confirm: "1", name, email })}`;
}

/**
 * Does this address already have an auth user? Asked of the signup Edge Function (it holds the
 * service role and the SIGNUP_ENABLED switch; the hub holds no key). undefined = could not tell.
 */
async function emailHasAccount(email: string, deps: SignupDeps): Promise<boolean | undefined> {
  const { supabaseUrl, supabaseAnonKey, fetchImpl = fetch } = deps;
  if (!supabaseUrl || !supabaseAnonKey) return undefined;
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/signup`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "exists", email }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { exists?: unknown };
    return typeof body.exists === "boolean" ? body.exists : undefined;
  } catch {
    return undefined;
  }
}

export interface PayFirstDeps extends SignupDeps {
  config: HubConfig;
  limiter?: CheckoutLimiter;
}

/**
 * Where the confirm step's submit goes: Stripe Checkout, or a hub path saying why not. Creates no
 * user and no workspace; the paid webhook does. Order matters: shape check, Stripe configured,
 * existing address (-> /login, no session made), then the session (one per address per 10 min).
 */
export async function payFirstTarget(form: SignupForm, deps: PayFirstDeps): Promise<string> {
  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();
  if (!name || name.length > NAME_MAX || email.length > EMAIL_MAX || !EMAIL.test(email)) return `${SIGNUP_PATH}?error=invalid`;
  const config = deps.config;
  if (!stripeReady(config)) return `${SIGNUP_PATH}?error=unconfigured`;
  const exists = await emailHasAccount(email, deps);
  if (exists === undefined) return `${SIGNUP_PATH}?error=failed`;
  if (exists) return "/login?error=signup-exists";
  const limiter = deps.limiter ?? defaultLimiter;
  const url = await limiter.once(email, () => signupCheckoutTarget({ name, email }, config, deps.fetchImpl));
  return url ?? `${SIGNUP_PATH}?error=billing`;
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
