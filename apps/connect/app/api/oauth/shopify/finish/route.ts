/**
 * GET /api/oauth/shopify/finish
 *
 * The one place a Shopify token is written. /callback hands it over sealed in
 * the shopify_pending cookie (lib/shopify-oauth.ts, sealPending). Signed out —
 * the usual case after a Shopify-initiated install — goes to /login, which sends
 * the owner straight back here. Binding needs a signed-in OWNER, and a
 * tenant-bound handshake binds only to its own tenant (openPending).
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
 * period ends) is let through by the Partner API check, when configured. A
 * tenant already bound to a DIFFERENT shop is refused before that, so it is never
 * offered a charge for a shop the write would refuse (BCNS7). The
 * bridge app (SB, `app === ALT_APP`) and any tenant-bound (hub-initiated) pending
 * are never gated — untouched, no network call, straight to the RPC as before.
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
  finishErrorCode,
  managedPricingRedirect,
  normalizeShop,
  openPending,
  registerUninstallWebhook,
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

  const gated = await managedPricingRedirect({
    api: session.api,
    pending,
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
    p_secret: pending.accessToken,
    p_config: scheduleConfig(pending.shop, pending.app), // sb-bridge: remove after SB migrates to bcns Connect
    p_interval: SHOPIFY_DEFAULTS.interval,
    p_backfill_depth: SHOPIFY_DEFAULTS.backfillDepth,
    p_refresh_secret: pending.refreshToken,
    p_expires_at: pending.expiresAt,
  });
  // `error.message` can echo a parameter value, and one of them is the token.
  if (error) return fail(`write_failed:${error.code ?? "rpc"}`, finishErrorCode(error));

  // After the write, so only a shop this tenant now holds is subscribed, and
  // never blocking it: the token is already stored, and rule 1.2.2 does not
  // depend on this webhook (the gate above checks the subscription on every
  // install). A failure only delays the revoke; the next connect registers again.
  // Public app only — the revoke ignores bridge-app rows.
  if (pending.app !== ALT_APP) {
    const registered = await registerUninstallWebhook(pending.shop, pending.accessToken, hub);
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
