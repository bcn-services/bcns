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
 *   6. token exchange     — only now does anything leave this server
 *   7. the write          — api.connect_source, tenant from the JWT
 *
 * Nothing before step 6 touches the network and nothing before step 7 touches
 * the database, so a forged callback costs an HMAC comparison and a redirect.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import {
  SHOPIFY_DEFAULTS,
  SHOPIFY_TOKEN_KIND,
  SHOPIFY_TOKEN_PATH,
  handleTokenResponse,
  normalizeShop,
  safeEqual,
  scheduleConfig,
  verifyQueryHmac,
  verifyState,
} from "@/lib/shopify-oauth";
import { oauthEnabled } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

/** Exchange the one-time code for a permanent Admin API token. */
async function exchange(shop: string, clientId: string, clientSecret: string, code: string) {
  const response = await fetch(`https://${shop}${SHOPIFY_TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
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
    response.cookies.delete("shopify_oauth_state");
    return response;
  };

  if (!oauthEnabled(config, "shopify")) return fail("unavailable");
  const secret = config.shopifyClientSecret!;
  const params = request.nextUrl.searchParams;

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

  // 5. requireOwner redirects on its own when there is no owner session.
  const session = await requireOwner("/");
  // The state names the tenant it was minted for. Signing back in as a different
  // client mid-handshake must not write this token into that other client.
  if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");

  // 6. Only now does the code leave this process.
  const exchanged = await exchange(shop, config.shopifyClientId!, secret, code);
  if (!exchanged.ok) return fail(`exchange_${exchanged.reason}`, exchanged.detail);

  // 7. The same two rows `add-source --source shopify` writes, through the same
  // data.attach_source function (20260918000100_attach_source_rpc.sql).
  const { error } = await session.api.rpc("connect_source", {
    p_source: "shopify",
    p_kind: SHOPIFY_TOKEN_KIND,
    p_secret: exchanged.token.accessToken,
    p_config: scheduleConfig(shop),
    p_interval: SHOPIFY_DEFAULTS.interval,
    p_backfill_depth: SHOPIFY_DEFAULTS.backfillDepth,
  });
  // `error.message` can echo a parameter value, and one of them is the token.
  if (error) return fail("write_failed", error.code ?? "rpc");

  const done = NextResponse.redirect(`${hub}/?connected=shopify`);
  done.cookies.delete("shopify_oauth_state");
  return done;
}
