/**
 * GET /api/oauth/meta/start — owner-only redirect to Meta's consent dialog with
 * a freshly signed state. Same shape and same reason for the owner gate as
 * shopify/start: api.connect_source is owner-only in the database.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { signState } from "@/lib/oauth-state";
import { authorizeUrl } from "@/lib/meta-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (!oauthEnabled(config, "meta")) return NextResponse.redirect(`${hub}/?error=oauth-unavailable`);

  const session = await requireOwner("/");
  const state = signState(session.membership.clientId, config.metaClientSecret!);

  const response = NextResponse.redirect(
    authorizeUrl(config.metaClientId!, redirectUri(config, "meta"), state)
  );
  response.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: "/api/oauth/meta",
    maxAge: 600,
  });
  return response;
}
