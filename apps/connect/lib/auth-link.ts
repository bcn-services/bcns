/**
 * auth-link.ts — the pure decisions behind the invite / password-reset flow.
 * Every function takes a supabase-like object (or plain values) so the tests
 * need no network; the route, page and actions are thin wrappers.
 */

/**
 * Minimum new-password length. platform/supabase/config.toml has
 * minimum_password_length = 6, but the hosted value is a dashboard setting we
 * can't read from here, so the hub enforces its own floor (>= the config value)
 * before calling GoTrue, which still has the final say.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const CONFIRM_TYPES = ["invite", "recovery", "email"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export const SET_PASSWORD_PATH = "/set-password";
export const LINK_EXPIRED_PATH = "/login?error=link-expired";
export const RESET_SENT_PATH = "/login?ok=reset-sent";

/** A same-origin path or null. Anything else is an open redirect. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  // Browsers treat "\" like "/", so "/\evil.com" and "//evil.com" are protocol-relative.
  // Check the decoded form too: "/%2Fevil.com" and "/%5Cevil.com" must not slip through.
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return null;
  }
  for (const value of [next, decoded]) {
    if (value.startsWith("//") || value.includes("\\") || [...value].some((c) => c.charCodeAt(0) < 32)) return null;
  }
  // Final backstop: resolving against a dummy origin must stay on that origin.
  try {
    if (new URL(next, "http://hub.invalid").origin !== "http://hub.invalid") return null;
  } catch {
    return null;
  }
  return next;
}

interface OtpClient {
  auth: {
    verifyOtp(params: { token_hash: string; type: ConfirmType }): Promise<{ error: unknown }>;
  };
}

/**
 * Where the browser goes after an emailed link. Invite and recovery always land
 * on /set-password (a `next` is ignored: nothing else makes sense before a
 * password exists); `email` honors a validated `next`. Any failure is one
 * answer, so a used, expired or forged link is indistinguishable.
 */
export async function confirmTarget(
  supabase: OtpClient | null,
  params: { token_hash?: string | null; type?: string | null; next?: string | null }
): Promise<string> {
  const { token_hash, type } = params;
  if (!supabase || !token_hash || !CONFIRM_TYPES.includes(type as ConfirmType)) return LINK_EXPIRED_PATH;
  let error: unknown;
  try {
    ({ error } = await supabase.auth.verifyOtp({ token_hash, type: type as ConfirmType }));
  } catch {
    return LINK_EXPIRED_PATH;
  }
  if (error) return LINK_EXPIRED_PATH;
  if (type === "invite" || type === "recovery") return SET_PASSWORD_PATH;
  return safeNext(params.next) ?? "/";
}

/**
 * Forgot-password: identical result for a known email, an unknown one, a
 * malformed one and a Supabase error, so the form can't be used to probe which
 * addresses have accounts.
 */
export async function requestResetTarget(
  supabase: { auth: { resetPasswordForEmail(email: string, opts: { redirectTo: string }): Promise<unknown> } } | null,
  email: string,
  redirectTo: string
): Promise<string> {
  const trimmed = email.trim();
  if (supabase && trimmed) {
    try {
      await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
    } catch {
      // swallowed on purpose: see above
    }
  }
  return RESET_SENT_PATH;
}

/** Signed-in guard for /set-password: the login path when there is no user. */
export async function setPasswordGuard(
  supabase: { auth: { getUser(): Promise<{ data: { user: unknown } }> } } | null
): Promise<string | null> {
  if (!supabase) return "/login?error=unconfigured";
  const { data } = await supabase.auth.getUser();
  return data.user ? null : "/login?error=signed-out";
}

/** Result path of a set-password submit: "/" on success, else back with an error code. */
export async function setPasswordTarget(
  supabase: {
    auth: {
      getUser(): Promise<{ data: { user: unknown } }>;
      updateUser(attrs: { password: string }): Promise<{ error: unknown }>;
      signOut(opts: { scope: "others" }): Promise<unknown>;
    };
  } | null,
  password: string,
  confirm: string
): Promise<string> {
  const denied = await setPasswordGuard(supabase);
  if (denied || !supabase) return denied ?? "/login?error=unconfigured";
  if (password !== confirm) return `${SET_PASSWORD_PATH}?error=mismatch`;
  if (password.length < MIN_PASSWORD_LENGTH) return `${SET_PASSWORD_PATH}?error=short`;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return `${SET_PASSWORD_PATH}?error=failed`;
  // A reset must evict other devices' sessions. The password is already changed, so a failure here is swallowed.
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch {
    // ignore
  }
  return "/";
}
