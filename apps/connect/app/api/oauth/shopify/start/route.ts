/**
 * GET /api/oauth/shopify/start?shop=<handle>.myshopify.com
 *
 * Two ways in. A hub owner presses Connect (session, no hmac). Or Shopify
 * installs the app: the app URL carries shop/hmac/timestamp and middleware.ts
 * rewrites it here with no bcns session. That path is trusted on Shopify's
 * query HMAC alone and mints a state with no tenant; /finish binds the shop
 * once an owner signs in (lib/shopify-oauth.ts, INSTALL_CLIENT_ID).
 *
 * Begins the handshake. Everything this route does is a redirect: either to
 * Shopify's consent screen with a freshly signed state, or back to the hub with
 * an error code the page renders.
 *
 * The Connect path is owner-only, and that gate belongs HERE rather than only on the callback: the
 * write at the end (api.connect_source) is owner-only in the database, so a
 * member who got this far would grant Shopify access and then hit a 403 with
 * the app already installed on their store.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import {
  INSTALL_CLIENT_ID,
  installUrl,
  isFreshInstallTimestamp,
  normalizeShop,
  shopifyAppFor,
  signState,
  verifyQueryHmac,
} from "@/lib/shopify-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

/** A signed-in, per-request redirect: nothing here may be cached or prerendered. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const back = (error: string) => NextResponse.redirect(`${hub}/?error=${error}`);

  // Unapproved or unconfigured: behave as if the route does not exist, so a
  // guessed URL can never start a handshake for a source that is not live yet.
  if (!oauthEnabled(config, "shopify")) return back("oauth-unavailable");

  const params = request.nextUrl.searchParams;
  const shop = normalizeShop(params.get("shop"));
  if (!shop) return back("invalid-shop");
  const app = shopifyAppFor(config, shop); // sb-bridge: remove after SB migrates to bcns Connect

  let clientId: string;
  if (params.has("hmac")) {
    // Shopify-initiated install. A forged or tampered query stops here, and so
    // does a genuine one replayed after its window (`timestamp` is under the HMAC).
    if (!verifyQueryHmac(params, app.clientSecret)) return back("connect-failed");
    if (!isFreshInstallTimestamp(params.get("timestamp"))) return back("connect-failed");
    clientId = INSTALL_CLIENT_ID;
  } else {
    // requireOwner redirects on failure; reaching the next line means owner.
    clientId = (await requireOwner("/")).membership.clientId;
  }

  const state = signState({ shop, clientId }, app.clientSecret);

  const response = NextResponse.redirect(
    installUrl(shop, app.clientId, redirectUri(config, "shopify"), state)
  );
  // The state also rides in a cookie. The signature already proves the state is
  // ours and names the tenant, so the cookie is belt-and-braces against a
  // login-CSRF variant: an attacker who replays a state they captured cannot
  // also set this cookie in the victim's browser.
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: "/api/oauth/shopify",
    maxAge: 600,
  });
  return response;
}
