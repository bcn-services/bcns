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

/** Per-cookie options from @supabase/ssr's setAll, with the session flags forced on top. */
export const hardenCookie = <T extends object>(options?: T) => ({
  ...options,
  ...sessionCookieOptions(),
});
