/**
 * GET /api/oauth/shopify/callback
 *
 * Where a stranger's request turns into a stored credential. The order below is
 * the security property, not a style choice:
 *
 *   1. approval gate      — an unapproved source has no callback at all
 *   2. Shopify's query HMAC — proves the whole query string came from Shopify
 *   3. our state          — signature, then expiry, then shop binding
 *   4. the state cookie   — the browser that finished is the one that started
 *   5. the session        — owner, and the SAME tenant the state was minted for
 *                           (skipped for an install-initiated state: no tenant yet)
 *   6. token exchange     — only now does anything leave this server
 *   7. the hand-off       — the token, sealed, to /finish, which does the write
 *
 * Nothing before step 6 touches the network and nothing here touches the
 * database, so a forged callback costs an HMAC comparison and a redirect.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import {
  FINISH_PATH,
  INSTALL_CLIENT_ID,
  PENDING_COOKIE,
  PENDING_TTL_MS,
  SHOPIFY_TOKEN_PATH,
  handleTokenResponse,
  normalizeShop,
  safeEqual,
  sealPending,
  shopifyAppFor,
  verifyQueryHmac,
  verifyState,
} from "@/lib/shopify-oauth";
import { oauthEnabled } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

/**
 * Exchange the one-time code for an Admin API token.
 *
 * `expiring: "1"` is load-bearing. Without it Shopify mints a non-expiring
 * token, and the Admin API rejects those: a real install on 2026-09-19 stored
 * an `shpat_` token that came back HTTP 403 "[API] Non-expiring access tokens
 * are no longer accepted for the Admin API" on the worker's first request.
 * The parameter belongs in THIS body, not on the authorize redirect, and it
 * works under use_legacy_install_flow — there is no dashboard toggle for it.
 * What comes back lasts an hour and carries a 90-day refresh_token.
 */
async function exchange(shop: string, clientId: string, clientSecret: string, code: string) {
  const response = await fetch(`https://${shop}${SHOPIFY_TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, expiring: "1" }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  return handleTokenResponse(response.status, body);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  /**
   * Every failure lands on the hub with a short code. Deliberately coarse: the
   * page tells a merchant the install did not complete, and a precise reason
   * ("bad signature" vs "expired") is an oracle for whoever forged the request.
   * The operator-facing detail goes to the server log instead.
   */
  const fail = (code: string, detail?: string) => {
    if (detail) console.warn(`[connect] shopify callback rejected (${code}): ${detail}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete({ name: "shopify_oauth_state", path: "/api/oauth/shopify" });
    return response;
  };

  if (!oauthEnabled(config, "shopify")) return fail("unavailable");
  const params = request.nextUrl.searchParams;
  // The raw shop only CHOOSES which secret to try; it is trusted after the HMAC below.
  const { clientId, clientSecret: secret, app } = shopifyAppFor(config, normalizeShop(params.get("shop"))); // sb-bridge: remove after SB migrates to bcns Connect

  // 2. Shopify's signature over the whole query string, before a single value
  // from it is read for anything. A tampered `shop`, `code` or `state` dies here.
  if (!verifyQueryHmac(params, secret)) return fail("query_hmac");

  const shop = normalizeShop(params.get("shop"));
  if (!shop) return fail("invalid_shop");
  const code = params.get("code");
  if (!code) return fail("no_code");

  // 3. Our own state: is this a handshake we started, for this shop, recently?
  const state = verifyState(params.get("state"), secret, shop);
  if (!state.ok) return fail(`state_${state.reason}`);

  // 4. The cookie /start set. Same value, so an attacker who captured a state
  // out of a redirect URL cannot complete it from their own browser.
  const cookie = request.cookies.get("shopify_oauth_state")?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail("state_cookie");

  // 5. A tenant-bound state needs its owner signed in NOW, before the code is
  // spent. Signing back in as a different client mid-handshake must not write
  // this token into that other client. An install-initiated state has no
  // tenant; /finish makes the owner sign in before anything is written.
  if (state.payload.clientId !== INSTALL_CLIENT_ID) {
    // requireOwner redirects on its own when there is no owner session.
    const session = await requireOwner("/");
    if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");
  }

  // 6. Only now does the code leave this process.
  const exchanged = await exchange(shop, clientId, secret, code);
  if (!exchanged.ok) return fail(`exchange_${exchanged.reason}`, exchanged.detail);

  // 7. /finish writes it. Sealed under the DEFAULT app's secret whichever app
  // issued the token: it is our key, and /finish has no shop to choose by.
  const sealed = sealPending(
    {
      clientId: state.payload.clientId,
      shop,
      app, // sb-bridge: remove after SB migrates to bcns Connect
      accessToken: exchanged.token.accessToken,
      refreshToken: exchanged.token.refreshToken,
      expiresAt: new Date(Date.now() + exchanged.token.expiresIn * 1000).toISOString(),
    },
    config.shopifyClientSecret!
  );
  const done = NextResponse.redirect(`${hub}${FINISH_PATH}`);
  done.cookies.delete({ name: "shopify_oauth_state", path: "/api/oauth/shopify" });
  done.cookies.set(PENDING_COOKIE, sealed, {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: "/api/oauth/shopify",
    maxAge: PENDING_TTL_MS / 1000,
  });
  return done;
}