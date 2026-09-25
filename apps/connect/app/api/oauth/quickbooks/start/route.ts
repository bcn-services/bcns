/**
 * POST /api/oauth/quickbooks/start — owner-only redirect to Intuit's consent
 * screen with a freshly signed state. POST, not GET, and a cross-site request
 * is refused (W5b #3), so a third-party page cannot force a reconnect.
 *
 * Hand-rolled rather than lib/oauth-connect.ts's startPOST: that helper (and its
 * PickSource type) exists for the Meta/Monday picker hand-off, which QuickBooks
 * does not need — realmId arrives directly on the callback query string.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { ownerSession } from "@/lib/session";
import { isCrossSite, signState, STATE_TTL_MS } from "@/lib/oauth-state";
import { authorizeUrl, QUICKBOOKS_STATE_COOKIE } from "@/lib/quickbooks-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

const STATE_PATH = "/api/oauth/quickbooks";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (isCrossSite(request.headers, hub)) {
    console.warn("[connect] quickbooks start rejected (cross_site)");
    return NextResponse.redirect(`${hub}/?error=connect-failed`, 303);
  }
  if (!oauthEnabled(config, "quickbooks")) return NextResponse.redirect(`${hub}/?error=oauth-unavailable`, 303);

  // Owner-only here, not just at the write: a member would consent and then be refused.
  const session = await ownerSession();
  if (!session) return NextResponse.redirect(`${hub}/?error=forbidden`, 303);

  const secret = config.quickbooksClientSecret!;
  const state = signState(session.membership.clientId, secret);
  const response = NextResponse.redirect(
    authorizeUrl(config.quickbooksClientId!, redirectUri(config, "quickbooks"), state),
    303
  );
  response.cookies.set(QUICKBOOKS_STATE_COOKIE, state, {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: STATE_PATH,
    maxAge: STATE_TTL_MS / 1000,
  });
  return response;
}
