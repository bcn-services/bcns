/**
 * signup.ts — the pure halves of self-service sign-up (P1). The page, its action and the
 * /auth/confirm hook are thin wrappers; everything here takes its deps so the tests need no
 * network.
 *
 * The account itself is made by the public `signup` Edge Function (platform/supabase/functions/
 * signup): it owns the service-role key, the no-orphan rollback and the hourly cap. This file
 * only forwards the form and maps the answer onto a redirect.
 */

import { createHmac } from "node:crypto";
import { requireMembership } from "@bcn-services/tenant";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubConfig } from "./env";
import { safeEqual } from "./oauth-state";
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

/** Trimmed name + lowercased email, or null when either is empty, over-long or not email-shaped. */
function cleanForm(form: SignupForm): SignupForm | null {
  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();
  if (!name || name.length > NAME_MAX || email.length > EMAIL_MAX || !EMAIL.test(email)) return null;
  return { name, email };
}

/**
 * The typed name + address ride to the confirm view in a signed cookie, never in the URL (logs,
 * history and Referer would keep them). `<base64url(json{name,email,exp})>.<hex hmac>`, signed under
 * a key derived from the Stripe secret key with its own label, so it is no MAC any other check takes.
 * Signed, not encrypted: it only goes back to the browser that typed it.
 */
export const SIGNUP_COOKIE = "bcns_signup";
export const SIGNUP_CONFIRM_PATH = `${SIGNUP_PATH}?confirm=1`;
export const SIGNUP_COOKIE_TTL_MS = 10 * 60 * 1000;

const signupMac = (body: string, secret: string) =>
  createHmac("sha256", createHmac("sha256", secret).update("signup-confirm:").digest()).update(body).digest("hex");

/** httpOnly, lax, secure on https; path /signup so only the sign-up page ever sees it. */
export const signupCookieOptions = (hubBaseUrl: string) => ({
  path: SIGNUP_PATH,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: hubBaseUrl.startsWith("https://"),
  maxAge: SIGNUP_COOKIE_TTL_MS / 1000,
});

/** `{ path: "/signup?confirm=1", value }` to set the cookie, or `{ path: "/signup?error=invalid" }`. */
export function signupConfirmCookie(
  form: SignupForm,
  secret: string,
  now: number = Date.now()
): { path: string; value?: string } {
  const clean = cleanForm(form);
  if (!clean) return { path: `${SIGNUP_PATH}?error=invalid` };
  const body = Buffer.from(JSON.stringify({ ...clean, exp: now + SIGNUP_COOKIE_TTL_MS }), "utf8").toString("base64url");
  return { path: SIGNUP_CONFIRM_PATH, value: `${body}.${signupMac(body, secret)}` };
}

/** The form a valid, unexpired cookie holds, else null. MAC first: an unsigned `exp` is attacker-chosen. */
export function verifySignupCookie(value: unknown, secret: string | undefined, now: number = Date.now()): SignupForm | null {
  if (!secret) return null;
  const parts = String(value ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, mac] = parts;
  if (!safeEqual(mac, signupMac(body, secret))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { name?: unknown; email?: unknown; exp?: unknown };
    if (typeof p.exp !== "number" || p.exp < now || typeof p.name !== "string" || typeof p.email !== "string") return null;
    return cleanForm({ name: p.name, email: p.email });
  } catch {
    return null;
  }
}

/**
 * Does this address already have an auth user? Asked of the signup Edge Function (it holds the
 * service role and the SIGNUP_ENABLED switch; the hub holds no key). undefined = could not tell.
 */
async function emailHasAccount(email: string, deps: SignupDeps, visitorIp?: string): Promise<boolean | undefined> {
  const { supabaseUrl, supabaseAnonKey, fetchImpl = fetch } = deps;
  if (!supabaseUrl || !supabaseAnonKey) return undefined;
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/signup`, {
      method: "POST",
      // The function trusts x-bcns-visitor-ip only from the droplet, and keys its budget on it.
      headers: { apikey: supabaseAnonKey, "Content-Type": "application/json", ...(visitorIp ? { "x-bcns-visitor-ip": visitorIp } : {}) },
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
  /** The visitor's address as nginx saw it; forwarded so the exists-check budget is per visitor. */
  visitorIp?: string;
}

/**
 * Where the confirm step's submit goes: Stripe Checkout, or a hub path saying why not. Creates no
 * user and no workspace; the paid webhook does. Order matters: shape check, Stripe configured,
 * existing address (-> /login, no session made), then the session (one per address per 10 min).
 */
export async function payFirstTarget(form: SignupForm, deps: PayFirstDeps): Promise<string> {
  const clean = cleanForm(form);
  if (!clean) return `${SIGNUP_PATH}?error=invalid`;
  const { name, email } = clean;
  const config = deps.config;
  if (!stripeReady(config)) return `${SIGNUP_PATH}?error=unconfigured`;
  const exists = await emailHasAccount(email, deps, deps.visitorIp);
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
