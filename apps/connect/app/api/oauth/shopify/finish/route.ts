/**
 * GET /api/oauth/shopify/finish
 *
 * The one place a Shopify code is exchanged and the token written. /callback
 * hands over the unspent code sealed in the shopify_pending cookie
 * (lib/shopify-oauth.ts, sealPending). Signed out — the usual case after a
 * Shopify-initiated install or "Open app" — goes to /login, which sends the
 * owner straight back here. Binding needs a signed-in OWNER, and a tenant-bound
 * handshake binds only to its own tenant (openPending).
 *
 * The order is the fix for 2026-10-24 (an exchange retires the shop's stored
 * refresh token): sign-in, owner, pending, then shopChecks (BCNS6 in use, BCNS7
 * mismatch), and only then the exchange. After it come only the subscription
 * gate (it needs the fresh token) and the write. An exchange failure (the code is
 * one-time and short-lived, so a slow sign-in can outlive it) is the
 * expired page, whose "Start again" reopens the app for a fresh code.
 *
 * Managed pricing (W6a follow-up, App Store rule 1.2.2) is gated HERE, not at
 * /callback. `middleware.ts` sends both a first-time install AND an existing
 * client's "Open app" click from the Shopify admin through the same
 * install-initiated path (clientId === INSTALL_CLIENT_ID); every one of those on
 * the public app is checked for an ACTIVE subscription, with the merchant's own
 * fresh token, before anything is written. An existing paying client has one and
 * passes; a first install, a lapsed plan and a not-yet-approved charge all land
 * on Shopify's plan page. A reinstall inside a period already paid for (Shopify
 * cancels the subscription on uninstall but offers nothing to approve until the
 * period ends) is let through by the Partner API check, when configured.
 * shopChecks runs before that, so a refused shop is never offered a charge. The
 * bridge app (SB, `app === ALT_APP`) and any tenant-bound (hub-initiated) pending
 * are never gated: no subscription call, straight to the RPC after the exchange.
 * The whole decision is lib/shopify-oauth.ts's `managedPricingRedirect`,
 * unit-tested there with a fake fetch.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { currentMembership, requireOwner } from "@/lib/session";
import {
  ALT_APP,
  FINISH_PATH,
  LAST_SHOP_COOKIE,
  PENDING_COOKIE,
  SHOPIFY_DEFAULTS,
  SHOPIFY_TOKEN_KIND,
  exchange,
  exchangeDiagnostic,
  finishErrorCode,
  managedPricingRedirect,
  normalizeShop,
  openPending,
  registerUninstallWebhook,
  scheduleConfig,
  shopChecks,
  shopifyAppFor,
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
  const fail = (code: string, hubError: string = "connect-failed") => {
    console.warn(`[connect] shopify finish rejected (${code})`);
    const response = NextResponse.redirect(`${hub}/?error=${hubError}`);
    response.cookies.delete({ name: PENDING_COOKIE, path: "/api/oauth/shopify" });
    // Kept only for the expiry page's "Start again"; any other outcome ends the flow.
    if (hubError !== "connect-expired") response.cookies.delete({ name: LAST_SHOP_COOKIE, path: "/api/oauth/shopify" });
    return response;
  };

  if (!oauthEnabled(config, "shopify")) return fail("unavailable");
  const sealed = request.cookies.get(PENDING_COOKIE)?.value;
  // The cookie is gone after its 15 minutes (or the browser dropped it): say so,
  // and carry the shop from the companion cookie so the page can offer "start again".
  const expired = (code: string) => {
    const shop = normalizeShop(request.cookies.get(LAST_SHOP_COOKIE)?.value);
    const response = fail(code, "connect-expired");
    if (shop) response.headers.set("location", `${hub}/?error=connect-expired&shop=${encodeURIComponent(shop)}`);
    return response;
  };
  if (!sealed) return expired("no_pending");

  // Keep the cookie and come back here after sign-in.
  if (!(await currentMembership())) {
    return NextResponse.redirect(`${hub}/login?next=${encodeURIComponent(FINISH_PATH)}`);
  }
  // A signed-in member who is not an owner lands on /?error=forbidden.
  const session = await requireOwner("/");

  const opened = openPending(sealed, config.shopifyClientSecret!, session.membership.clientId);
  if (!opened.ok) return opened.reason === "expired" ? expired("expired") : fail(opened.reason);
  const { pending } = opened;

  // Before the exchange: a refusal here leaves the holder's stored token alive.
  const refused = await shopChecks(session.api, pending.shop, fail);
  if (refused) return refused;

  // The new grant, with the app that issued the code (sb-bridge). If SHOPIFY_ALT_*
  // changed since /callback, the pair no longer matches the code: refuse.
  const { clientId, clientSecret, app } = shopifyAppFor(config, pending.shop);
  if (app !== pending.app) return fail("app_changed");
  const exchanged = await exchange(pending.shop, clientId, clientSecret, pending.code);
  if (!exchanged.ok) {
    const reason = `exchange_${exchanged.reason}${exchangeDiagnostic(exchanged)}`;
    // A stale or spent code, or a blip, is worth "Start again"; anything else repeats on retry.
    return exchanged.reason === "http_error" || exchanged.reason === "network_error" ? expired(reason) : fail(reason);
  }
  const { token } = exchanged;

  const gated = await managedPricingRedirect({
    api: session.api,
    pending,
    accessToken: token.accessToken,
    appHandle: config.shopifyAppHandle,
    partner: { token: config.shopifyPartnerApiToken, orgId: config.shopifyPartnerOrgId, appGid: config.shopifyAppGid },
    fail,
  });
  if (gated) return gated;

  // p_refresh_secret and p_expires_at are what make the connection renewable
  // (20260919000100_connect_source_refresh.sql). Without them the row holds an
  // access token that dies in an hour with no way back.
  const { error } = await session.api.rpc("connect_source", {
    p_source: "shopify",
    p_kind: SHOPIFY_TOKEN_KIND,
    p_secret: token.accessToken,
    p_config: scheduleConfig(pending.shop, pending.app), // sb-bridge: remove after SB migrates to bcns Connect
    p_interval: SHOPIFY_DEFAULTS.interval,
    p_backfill_depth: SHOPIFY_DEFAULTS.backfillDepth,
    p_refresh_secret: token.refreshToken,
    p_expires_at: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
  });
  // `error.message` can echo a parameter value, and one of them is the token.
  if (error) return fail(`write_failed:${error.code ?? "rpc"}`, finishErrorCode(error));

  // After the write, so only a shop this tenant now holds is subscribed, and
  // never blocking it: the token is already stored, and rule 1.2.2 does not
  // depend on this webhook (the gate above checks the subscription on every
  // install). A failure only delays the revoke; the next connect registers again.
  // Public app only — the revoke ignores bridge-app rows.
  if (pending.app !== ALT_APP) {
    const registered = await registerUninstallWebhook(pending.shop, token.accessToken, hub);
    if (!registered.ok) {
      console.warn(`[connect] shopify uninstall webhook not registered (${registered.reason}) shop=${pending.shop}`);
    } else {
      console.info(`[connect] shopify uninstall webhook registered shop=${pending.shop}`);
    }
  }

  const done = NextResponse.redirect(`${hub}/?connected=shopify`);
  done.cookies.delete({ name: PENDING_COOKIE, path: "/api/oauth/shopify" });
  done.cookies.delete({ name: LAST_SHOP_COOKIE, path: "/api/oauth/shopify" });
  return done;
}
