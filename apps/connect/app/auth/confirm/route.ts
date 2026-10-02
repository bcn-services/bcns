import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@bcn-services/tenant";
import { confirmTarget, LINK_EXPIRED_PATH } from "@/lib/auth-link";
import { getConfig } from "@/lib/env";
import { notifySignupConfirmed } from "@/lib/signup";

export const dynamic = "force-dynamic";

/**
 * Landing for the invite, password-reset and sign-up confirmation emails (token_hash + verifyOtp, the
 * SSR flow in the Supabase docs). Public in the matcher: the visitor has no
 * session yet; verifyOtp is what creates it.
 *
 * The redirect is built from hubBaseUrl, not request.url: behind nginx the app
 * sees http://localhost:<port>, so request.url would bounce the browser to
 * localhost. hubBaseUrl is config (HUB_BASE_URL overrides it for local dev),
 * never request input, so it can't be steered by a header.
 *
 * Local dev: if HUB_BASE_URL differs from the host you are browsing, verifyOtp sets
 * the session cookie for the request host but the redirect lands on the other
 * origin, so the session is lost. /auth/confirm only works locally when
 * HUB_BASE_URL matches the host in use (e.g. http://localhost:3000).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams;
  const supabase = createServerSupabase();
  const path = await confirmTarget(supabase, {
    token_hash: q.get("token_hash"),
    type: q.get("type"),
    next: q.get("next"),
  });
  const config = getConfig();
  // A self-service sign-up's confirmation link (type=email): tell bcns once, on the click
  // that verified it. confirmTarget sends it to /set-password (the account has no password yet); the
  // middleware confines the pending session to that page and /pending.
  if (config.signupEnabled && q.get("type") === "email" && path !== LINK_EXPIRED_PATH) {
    await notifySignupConfirmed(supabase, { apiKey: config.resendApiKey });
  }
  return NextResponse.redirect(`${config.hubBaseUrl}${path}`, 303);
}
