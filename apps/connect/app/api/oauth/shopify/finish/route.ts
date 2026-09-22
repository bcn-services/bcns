/**
 * GET /api/oauth/shopify/finish
 *
 * The one place a Shopify token is written. /callback hands it over sealed in
 * the shopify_pending cookie (lib/shopify-oauth.ts, sealPending). Signed out —
 * the usual case after a Shopify-initiated install — goes to /login, which sends
 * the owner straight back here. Binding needs a signed-in OWNER, and a
 * tenant-bound handshake binds only to its own tenant (openPending).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { currentMembership, requireOwner } from "@/lib/session";
import {
  FINISH_PATH,
  PENDING_COOKIE,
  SHOPIFY_DEFAULTS,
  SHOPIFY_TOKEN_KIND,
  openPending,
  scheduleConfig,
} from "@/lib/shopify-oauth";
import { oauthEnabled } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  /**
   * The login server action redirects here, and Next answers a server-action
   * redirect by fetching the target itself with an `RSC: 1` header (and the
   * client router would do the same). That fetch would do the write and drop
   * our cookie changes. Answer it with nothing: a non-RSC reply makes the
   * browser do a full navigation, and that request does the work.
   */
  if (request.headers.has("rsc")) return new NextResponse(null, { status: 204 });

  const config = getConfig();
  const hub = config.hubBaseUrl;
  const fail = (code: string) => {
    console.warn(`[connect] shopify finish rejected (${code})`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete({ name: PENDING_COOKIE, path: "/api/oauth/shopify" });
    return response;
  };

  if (!oauthEnabled(config, "shopify")) return fail("unavailable");
  const sealed = request.cookies.get(PENDING_COOKIE)?.value;
  if (!sealed) return fail("no_pending");

  // Keep the cookie and come back here after sign-in.
  if (!(await currentMembership())) {
    return NextResponse.redirect(`${hub}/login?next=${encodeURIComponent(FINISH_PATH)}`);
  }
  // A signed-in member who is not an owner lands on /?error=forbidden.
  const session = await requireOwner("/");

  const opened = openPending(sealed, config.shopifyClientSecret!, session.membership.clientId);
  if (!opened.ok) return fail(opened.reason);
  const { pending } = opened;

  // p_refresh_secret and p_expires_at are what make the connection renewable
  // (20260919000100_connect_source_refresh.sql). Without them the row holds an
  // access token that dies in an hour with no way back.
  const { error } = await session.api.rpc("connect_source", {
    p_source: "shopify",
    p_kind: SHOPIFY_TOKEN_KIND,
    p_secret: pending.accessToken,
    p_config: scheduleConfig(pending.shop, pending.app), // sb-bridge: remove after SB migrates to bcns Connect
    p_interval: SHOPIFY_DEFAULTS.interval,
    p_backfill_depth: SHOPIFY_DEFAULTS.backfillDepth,
    p_refresh_secret: pending.refreshToken,
    p_expires_at: pending.expiresAt,
  });
  // `error.message` can echo a parameter value, and one of them is the token.
  if (error) return fail(`write_failed:${error.code ?? "rpc"}`);

  const done = NextResponse.redirect(`${hub}/?connected=shopify`);
  done.cookies.delete({ name: PENDING_COOKIE, path: "/api/oauth/shopify" });
  return done;
}
