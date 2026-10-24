/**
 * GET /api/oauth/shopify/callback
 *
 * Where a stranger's request becomes a sealed, unspent code. The order below is
 * the security property, not a style choice:
 *
 *   1. approval gate      — an unapproved source has no callback at all
 *   2. Shopify's query HMAC — proves the whole query string came from Shopify
 *   3. our state          — signature, then expiry, then shop binding
 *   4. the state cookie   — the browser that finished is the one that started
 *   5. the session        — owner, and the SAME tenant the state was minted for
 *                           (skipped for an install-initiated state: no tenant yet)
 *   6. the hand-off       — the code, sealed, to /finish
 *
 * No token exchange here. The exchange is a new grant, and a new grant retires
 * the refresh token already stored for the shop (2026-10-24: a reviewer's "Open
 * app" with no hub session exchanged here, abandoned sign-in, and the stored
 * token died at the next refresh). /finish exchanges only once an owner is
 * signed in and the shop checks pass, so an abandoned sign-in spends nothing.
 *
 * Managed pricing (W6a follow-up) is NOT gated here. `middleware.ts` sends both
 * a first-time install AND an existing client's "Open app" click through this
 * same install-initiated path, and /finish checks the subscription for every
 * one of them once an owner is signed in — see finish/route.ts's header.
 *
 * Nothing here calls Shopify and nothing here touches the database, so a forged
 * callback costs an HMAC comparison and a redirect.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import {
  FINISH_PATH,
  INSTALL_CLIENT_ID,
  LAST_SHOP_COOKIE,
  LAST_SHOP_TTL_MS,
  PENDING_COOKIE,
  PENDING_TTL_MS,
  normalizeShop,
  safeEqual,
  sealPending,
  shopifyAppFor,
  storeHandleFromHost,
  verifyQueryHmac,
  verifyState,
} from "@/lib/shopify-oauth";
import { oauthEnabled } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const params = request.nextUrl.searchParams;
  // Read-only normalization, safe before any check below. Not yet trusted as
  // "this request really is Shopify" until verifyQueryHmac passes — only used
  // here to pick a secret to try and to name the shop in the reject log.
  const shop = normalizeShop(params.get("shop"));
  /**
   * Every failure lands on the hub with a short code. Deliberately coarse: the
   * page tells a merchant the install did not complete, and a precise reason
   * ("bad signature" vs "expired") is an oracle for whoever forged the request.
   * The reason code and shop go to the server log instead — never the detail,
   * which can echo request-controlled or provider-controlled text.
   */
  const fail = (code: string) => {
    console.warn(`[connect] shopify callback rejected (${code}): shop=${shop ?? "none"}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete({ name: "shopify_oauth_state", path: "/api/oauth/shopify" });
    return response;
  };

  if (!oauthEnabled(config, "shopify")) return fail("unavailable");
  // The raw shop only CHOOSES which secret to try; it is trusted after the HMAC below.
  const { clientSecret: secret, app } = shopifyAppFor(config, normalizeShop(params.get("shop"))); // sb-bridge: remove after SB migrates to bcns Connect

  // 2. Shopify's signature over the whole query string, before a single value
  // from it is read for anything. A tampered `shop`, `code` or `state` dies here.
  if (!verifyQueryHmac(params, secret)) return fail("query_hmac");

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
  // sealed. Signing back in as a different client mid-handshake must not write
  // this token into that other client. An install-initiated state has no
  // tenant; /finish makes the owner sign in before anything is written.
  if (state.payload.clientId !== INSTALL_CLIENT_ID) {
    // requireOwner redirects on its own when there is no owner session.
    const session = await requireOwner("/");
    if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");
  }

  // 6. /finish exchanges and writes it (and, for an install-initiated state on
  // the public app, decides whether managed pricing needs to be gated first —
  // see its own doc comment). Sealed under the DEFAULT app's secret whichever
  // app issued the code: it is our key, and /finish has no shop to choose by. `host` is
  // under the query HMAC verified in step 2, so it is safe to decode here even
  // though nothing before this point trusted it.
  const storeHandle = storeHandleFromHost(params.get("host"));
  const sealed = sealPending(
    {
      clientId: state.payload.clientId,
      shop,
      app, // sb-bridge: remove after SB migrates to bcns Connect
      code,
      storeHandle,
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
  if (!app) {
    done.cookies.set(LAST_SHOP_COOKIE, shop, {
      httpOnly: true,
      secure: hub.startsWith("https://"),
      sameSite: "lax",
      path: "/api/oauth/shopify",
      maxAge: LAST_SHOP_TTL_MS / 1000,
    });
  }
  return done;
}