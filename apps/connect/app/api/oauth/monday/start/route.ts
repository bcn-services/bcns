/** GET /api/oauth/monday/start — owner-only redirect to Monday's consent screen with signed state. */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { signState } from "@/lib/oauth-state";
import { authorizeUrl } from "@/lib/monday-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (!oauthEnabled(config, "monday")) return NextResponse.redirect(`${hub}/?error=oauth-unavailable`);

  const session = await requireOwner("/");
  const state = signState(session.membership.clientId, config.mondayClientSecret!);

  const response = NextResponse.redirect(
    authorizeUrl(config.mondayClientId!, redirectUri(config, "monday"), state)
  );
  response.cookies.set("monday_oauth_state", state, {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: "/api/oauth/monday",
    maxAge: 600,
  });
  return response;
}
