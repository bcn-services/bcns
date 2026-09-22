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
import { safeEqual, verifyState } from "@/lib/oauth-state";
import {
  MONDAY_API,
  MONDAY_DEFAULTS,
  MONDAY_TOKEN_KIND,
  MONDAY_TOKEN_URL,
  handleMondayToken,
  pickBoard,
  scheduleConfig,
} from "@/lib/monday-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const fail = (code: string, detail?: string) => {
    if (detail) console.warn(`[connect] monday callback rejected (${code}): ${detail}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`);
    response.cookies.delete("monday_oauth_state");
    return response;
  };

  if (!oauthEnabled(config, "monday")) return fail("unavailable");
  const secret = config.mondayClientSecret!;
  const params = request.nextUrl.searchParams;

  const state = verifyState(params.get("state"), secret);
  if (!state.ok) return fail(`state_${state.reason}`);

  const cookie = request.cookies.get("monday_oauth_state")?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail("state_cookie");

  const session = await requireOwner("/");
  if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");

  const code = params.get("code");
  if (!code) return fail("no_code");

  const tokenResponse = await fetch(MONDAY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.mondayClientId!,
      client_secret: secret,
      code,
      redirect_uri: redirectUri(config, "monday"),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const token = handleMondayToken(tokenResponse.status, await tokenResponse.json().catch(() => null));
  if (!token.ok) return fail(`exchange_${token.reason}`, token.detail);

  // The connector syncs one board and configSchema requires its id.
  const boards = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token.accessToken, "API-Version": "2025-01" },
    body: JSON.stringify({ query: "{ boards(limit: 25, state: active, order_by: created_at) { id } }" }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const boardId = boards.ok ? pickBoard(await boards.json().catch(() => null)) : null;
  if (!boardId) return fail("no_board", `HTTP ${boards.status}`);

  const { error } = await session.api.rpc("connect_source", {
    p_source: "monday",
    p_kind: MONDAY_TOKEN_KIND,
    p_secret: token.accessToken,
    p_config: scheduleConfig(boardId),
    p_interval: MONDAY_DEFAULTS.interval,
    p_backfill_depth: MONDAY_DEFAULTS.backfillDepth,
  });
  if (error) return fail("write_failed", error.code ?? "rpc");

  const done = NextResponse.redirect(`${hub}/?connected=monday`);
  done.cookies.delete("monday_oauth_state");
  return done;
}
