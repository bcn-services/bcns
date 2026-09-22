/**
 * GET /api/oauth/monday/callback
 *
 * Monday sends no HMAC: the signed state is the only CSRF defense, so it is
 * verified FIRST, before the code is read for anything. Then the state cookie,
 * the owner session and its tenant, and only then the network.
 * Monday OAuth tokens do not expire, so there is no refresh secret or expiry.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { safeEqual, verifyState, type PickOption } from "@/lib/oauth-state";
import { BOARDS_QUERY, MONDAY_API, MONDAY_TOKEN_URL, handleMondayToken, listBoards } from "@/lib/monday-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";
import { bindOrPick, stateCookie } from "@/lib/oauth-connect";

export const dynamic = "force-dynamic";

type Handshake = { ok: true; accessToken: string; options: PickOption[] } | { ok: false; code: string; detail?: string };

/** Code → token → the token's boards. Every network call is here. */
async function handshake(clientId: string, secret: string, redirect: string, code: string): Promise<Handshake> {
  const tokenResponse = await fetch(MONDAY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: secret, code, redirect_uri: redirect }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const token = handleMondayToken(tokenResponse.status, await tokenResponse.json().catch(() => null));
  if (!token.ok) return { ok: false, code: `exchange_${token.reason}`, detail: token.detail };

  // The connector syncs one board and configSchema requires its id.
  const boards = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token.accessToken, "API-Version": "2025-01" },
    body: JSON.stringify({ query: BOARDS_QUERY }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const options = boards.ok ? listBoards(await boards.json().catch(() => null)) : [];
  if (!options.length) return { ok: false, code: "no_board", detail: `HTTP ${boards.status}` };
  return { ok: true, accessToken: token.accessToken, options };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const fail = (code: string, detail?: string) => {
    if (detail) console.warn(`[connect] monday callback rejected (${code}): ${detail}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete({ name: stateCookie("monday"), path: "/api/oauth/monday" });
    return response;
  };

  if (!oauthEnabled(config, "monday")) return fail("unavailable");
  const secret = config.mondayClientSecret!;
  const params = request.nextUrl.searchParams;

  const state = verifyState(params.get("state"), secret);
  if (!state.ok) return fail(`state_${state.reason}`);

  const cookie = request.cookies.get(stateCookie("monday"))?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail("state_cookie");

  const session = await requireOwner("/");
  if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");

  const code = params.get("code");
  if (!code) return fail("no_code");

  // A timeout or DNS failure is a connect-failed with the cookie cleared, not a 500.
  const result = await handshake(config.mondayClientId!, secret, redirectUri(config, "monday"), code).catch(
    (): Handshake => ({ ok: false, code: "network" })
  );
  if (!result.ok) return fail(result.code, result.detail ?? result.code);

  // One board: connect it. Several: the owner picks (W5b #1). Never a guess.
  return bindOrPick("monday", session, config, {
    clientId: state.payload.clientId,
    accessToken: result.accessToken,
    expiresAt: null,
    options: result.options,
  });
}
