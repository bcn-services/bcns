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
import { safeEqual, verifyState, type PickOption } from "@/lib/oauth-state";
import {
  AD_ACCOUNT_FIELDS,
  META_GRAPH,
  codeExchangeBody,
  handleMetaToken,
  listAdAccounts,
  longLivedBody,
  type MetaTokenResult,
} from "@/lib/meta-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";
import { bindOrPick, stateCookie } from "@/lib/oauth-connect";

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

type Handshake =
  | { ok: true; accessToken: string; expiresAt: string | null; options: PickOption[] }
  | { ok: false; code: string; detail?: string };

/** Code → short token → long token → the token's active ad accounts. Every network call is here. */
async function handshake(clientId: string, secret: string, redirect: string, code: string): Promise<Handshake> {
  const short = await tokenCall(codeExchangeBody(clientId, secret, redirect, code));
  if (!short.ok) return { ok: false, code: `exchange_${short.reason}`, detail: short.detail };
  const long = await tokenCall(longLivedBody(clientId, secret, short.accessToken));
  if (!long.ok) return { ok: false, code: `long_lived_${long.reason}`, detail: long.detail };

  // The connector needs act_id; the token is the only thing that can name it.
  const accounts = await fetch(`${META_GRAPH}/me/adaccounts?fields=${AD_ACCOUNT_FIELDS}&limit=25`, {
    headers: { Authorization: `Bearer ${long.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const options = accounts.ok ? listAdAccounts(await accounts.json().catch(() => null)) : [];
  if (!options.length) return { ok: false, code: "no_ad_account", detail: `HTTP ${accounts.status}` };
  return {
    ok: true,
    accessToken: long.accessToken,
    expiresAt: long.expiresIn ? new Date(Date.now() + long.expiresIn * 1000).toISOString() : null,
    options,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const fail = (code: string, detail?: string) => {
    if (detail) console.warn(`[connect] meta callback rejected (${code}): ${detail}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete({ name: stateCookie("meta"), path: "/api/oauth/meta" });
    return response;
  };

  if (!oauthEnabled(config, "meta")) return fail("unavailable");
  const secret = config.metaClientSecret!;
  const clientId = config.metaClientId!;
  const params = request.nextUrl.searchParams;

  // Our state first: with no upstream signature it is the whole CSRF defense.
  const state = verifyState(params.get("state"), secret);
  if (!state.ok) return fail(`state_${state.reason}`);

  const cookie = request.cookies.get(stateCookie("meta"))?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail("state_cookie");

  const session = await requireOwner("/");
  if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");

  // User declined, or Meta errored: nothing to exchange.
  const code = params.get("code");
  if (!code) return fail("no_code");

  // A timeout or DNS failure is a connect-failed with the cookie cleared, not a 500.
  const result = await handshake(clientId, secret, redirectUri(config, "meta"), code).catch(
    (): Handshake => ({ ok: false, code: "network" })
  );
  if (!result.ok) return fail(result.code, result.detail ?? result.code);

  // One account: connect it. Several: the owner picks (W5b #1). Never a guess.
  return bindOrPick("meta", session, config, {
    clientId: state.payload.clientId,
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    options: result.options,
  });
}
