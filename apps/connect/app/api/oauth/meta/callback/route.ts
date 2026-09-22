/**
 * GET /api/oauth/meta/callback
 *
 * Order is the security property (see shopify/callback): approval gate, our
 * signed state, the state cookie, the owner session and its tenant, and only
 * then the network. Meta sends no query signature, so state is the CSRF check.
 *
 * Tokens: Meta's code exchange yields a SHORT-lived token (~1-2h). It is traded
 * for the long-lived one (~60 days) in the same request and only the long-lived
 * token is written. Neither token, nor any response body, is ever logged.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { safeEqual, verifyState } from "@/lib/oauth-state";
import {
  META_DEFAULTS,
  META_GRAPH,
  META_TOKEN_KIND,
  codeExchangeBody,
  handleMetaToken,
  longLivedBody,
  pickAdAccount,
  scheduleConfig,
  type MetaTokenResult,
} from "@/lib/meta-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

/** POST a form to a Graph token endpoint. Secrets ride in the body, not the URL. */
async function tokenCall(body: string): Promise<MetaTokenResult> {
  const response = await fetch(`${META_GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return handleMetaToken(response.status, await response.json().catch(() => null));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const fail = (code: string, detail?: string) => {
    if (detail) console.warn(`[connect] meta callback rejected (${code}): ${detail}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete("meta_oauth_state");
    return response;
  };

  if (!oauthEnabled(config, "meta")) return fail("unavailable");
  const secret = config.metaClientSecret!;
  const clientId = config.metaClientId!;
  const params = request.nextUrl.searchParams;

  // Our state first: with no upstream signature it is the whole CSRF defense.
  const state = verifyState(params.get("state"), secret);
  if (!state.ok) return fail(`state_${state.reason}`);

  const cookie = request.cookies.get("meta_oauth_state")?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail("state_cookie");

  const session = await requireOwner("/");
  if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");

  // User declined, or Meta errored: nothing to exchange.
  const code = params.get("code");
  if (!code) return fail("no_code");

  const redirect = redirectUri(config, "meta");
  const short = await tokenCall(codeExchangeBody(clientId, secret, redirect, code));
  if (!short.ok) return fail(`exchange_${short.reason}`, short.detail);
  const long = await tokenCall(longLivedBody(clientId, secret, short.accessToken));
  if (!long.ok) return fail(`long_lived_${long.reason}`, long.detail);

  // The connector needs act_id; the token is the only thing that can name it.
  const accounts = await fetch(`${META_GRAPH}/me/adaccounts?fields=id&limit=25`, {
    headers: { Authorization: `Bearer ${long.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const actId = accounts.ok ? pickAdAccount(await accounts.json().catch(() => null)) : null;
  if (!actId) return fail("no_ad_account", `HTTP ${accounts.status}`);

  const { error } = await session.api.rpc("connect_source", {
    p_source: "meta",
    p_kind: META_TOKEN_KIND,
    p_secret: long.accessToken,
    p_config: scheduleConfig(actId),
    p_interval: META_DEFAULTS.interval,
    p_backfill_depth: META_DEFAULTS.backfillDepth,
    p_refresh_secret: null,
    p_expires_at: long.expiresIn ? new Date(Date.now() + long.expiresIn * 1000).toISOString() : null,
  });
  // error.message can echo a parameter value, and one of them is the token.
  if (error) return fail("write_failed", error.code ?? "rpc");

  const done = NextResponse.redirect(`${hub}/?connected=meta`);
  done.cookies.delete("meta_oauth_state");
  return done;
}
