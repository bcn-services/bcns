/**
 * GET /api/oauth/shopify/finish
 *
 * The one place a Shopify token is written. /callback hands it over sealed in
 * the shopify_pending cookie (lib/shopify-oauth.ts, sealPending). Signed out —
 * the usual case after a Shopify-initiated install — goes to /login, which sends
 * the owner straight back here. Binding needs a signed-in OWNER, and a
 * tenant-bound handshake binds only to its own tenant (openPending).
 *
 * Managed pricing (W6a follow-up) is gated HERE, not at /callback. `middleware.ts`
 * sends both a first-time install AND an existing client's "Open app" click from
 * the Shopify admin through the same install-initiated path (clientId ===
 * INSTALL_CLIENT_ID), and only here — signed in, with a real tenant — can we tell
 * those apart: `alreadyConnected` reads whether this tenant already has a Shopify
 * source before deciding anything. A DB error on that read fails closed to the
 * generic error page (never silently treated as "no source" — that would gate an
 * existing paying client). The bridge app (SB, `app === ALT_APP`) and any
 * tenant-bound (hub-initiated) pending are never gated — untouched, no network
 * call, straight to the RPC as before. The whole decision is
 * lib/shopify-oauth.ts's `managedPricingRedirect`, unit-tested there with a fake
 * `api` and a fake fetch.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { currentMembership, requireOwner } from "@/lib/session";
import {
  FINISH_PATH,
  PENDING_COOKIE,
  SHOPIFY_DEFAULTS,
  SHOPIFY_TOKEN_KIND,
  managedPricingRedirect,
  openPending,
  scheduleConfig,
  type HealthCheckApi,
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

  const gated = await managedPricingRedirect({
    // session.api's real type is Supabase's generic PostgrestFilterBuilder chain,
    // which is structurally compatible with HealthCheckApi but deep enough that
    // tsc's structural check itself blows its instantiation-depth limit (TS2589)
    // trying to prove it. The cast is the only new-here bit; the shape it targets
    // is intentionally narrow so a test's plain fake satisfies it without one.
    api: session.api as unknown as HealthCheckApi,
    pending,
    appHandle: config.shopifyAppHandle,
    fail,
  });
  if (gated) return gated;

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
