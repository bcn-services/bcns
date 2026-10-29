/**
 * session-header.ts — how the middleware hands the user + profile it already validated to getSession(), so a
 * page doesn't repeat getUser() + the profiles select. No next/* imports: tests import this directly.
 * The middleware overwrites this header on every admitted request and gate() deletes it on public paths, so a
 * client-sent copy never reaches a handler.
 */

export const SESSION_HEADER = "x-hq-session";

export interface SessionUser {
  id: string;
  email?: string;
}
export interface Profile {
  id: string;
  handle: "nate" | "brandon" | null;
  role: "admin" | "staff" | null;
  display_name: string | null;
}
export interface SessionData {
  user: SessionUser;
  profile: Profile;
}

// URI-encoded: header values must be Latin-1 and display_name may not be.
export const encodeSession = (s: SessionData): string => encodeURIComponent(JSON.stringify(s));

/** null for a missing or malformed header: the caller falls back to asking Supabase. */
export function decodeSession(raw: string | null): SessionData | null {
  if (!raw) return null;
  try {
    const s: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof s !== "object" || s === null || !("user" in s) || !("profile" in s)) return null;
    const { user, profile } = s;
    const str = (o: unknown, k: string) =>
      typeof o === "object" &&
      o !== null &&
      k in o &&
      typeof (o as Record<string, unknown>)[k] === "string"; // narrowed to an object with the key just above
    if (!str(user, "id") || !str(profile, "id")) return null;
    return s as SessionData; // shape checked above (id fields); the rest was written by our own middleware
  } catch {
    return null;
  }
}
