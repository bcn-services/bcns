/**
 * cookie-options.ts — the one place HQ's session cookie flags are set. HttpOnly because nothing in
 * the browser reads the Supabase session (there is no browser client), SameSite=Lax, Secure in
 * production (dev runs on http://localhost), host-only (no `domain`).
 */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/** 30 days. @supabase/ssr forces its own 400-day maxAge on every set, so the cap is applied here, on the way out. */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Per-cookie options from @supabase/ssr's setAll, with the session flags forced on top and maxAge capped
 * at 30 days (a shorter one, e.g. 0 on removal, passes through). Every refresh re-sets it, so it rolls.
 */
export const hardenCookie = <T extends { maxAge?: number }>(options?: T) => ({
  ...options,
  ...sessionCookieOptions(),
  maxAge: Math.min(options?.maxAge ?? SESSION_MAX_AGE, SESSION_MAX_AGE),
});
