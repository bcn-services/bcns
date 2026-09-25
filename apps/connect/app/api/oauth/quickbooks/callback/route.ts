/**
 * GET /api/oauth/quickbooks/callback
 *
 * Intuit sends no HMAC: the signed state is the only CSRF defense, so it is
 * verified FIRST, before anything else is read. Then the state cookie, the
 * owner session and its tenant, then `code` AND `realmId` (both required —
 * QuickBooks always sends the company id on the callback query string, and
 * there is no other way to learn it), and only then the network.
 *
 * No board/account picker and no extra QBO API call: realmId is already the
 * one thing configSchema needs, unlike Meta/Monday which must list accounts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { safeEqual, verifyState } from "@/lib/oauth-state";
import { connectArgs, exchangeCode, QUICKBOOKS_STATE_COOKIE } from "@/lib/quickbooks-oauth";
import { oauthEnabled, redirectUri } from "@/lib/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  const fail = (code: string, detail?: string) => {
    if (detail) console.warn(`[connect] quickbooks callback rejected (${code}): ${detail}`);
    const response = NextResponse.redirect(`${hub}/?error=connect-failed`, 303);
    response.cookies.delete({ name: QUICKBOOKS_STATE_COOKIE, path: "/api/oauth/quickbooks" });
    return response;
  };

  if (!oauthEnabled(config, "quickbooks")) return fail("unavailable");
  const secret = config.quickbooksClientSecret!;
  const params = request.nextUrl.searchParams;

  const state = verifyState(params.get("state"), secret);
  if (!state.ok) return fail(`state_${state.reason}`);

  const cookie = request.cookies.get(QUICKBOOKS_STATE_COOKIE)?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail("state_cookie");

  const session = await requireOwner("/");
  if (session.membership.clientId !== state.payload.clientId) return fail("tenant_mismatch");

  const code = params.get("code");
  const realmId = params.get("realmId");
  if (!code) return fail("no_code");
  if (!realmId) return fail("no_realm_id");

  // A timeout or DNS failure is a connect-failed with the cookie cleared, not a 500.
  const token = await exchangeCode(config.quickbooksClientId!, secret, redirectUri(config, "quickbooks"), code).catch(
    () => ({ ok: false as const, reason: "http_error" as const, detail: "network" })
  );
  if (!token.ok) return fail(`exchange_${token.reason}`, token.detail);

  const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
  const { error } = await session.api.rpc(
    "connect_source",
    connectArgs(token.accessToken, token.refreshToken, expiresAt, realmId)
  );
  // error.message can echo a parameter value, and one of them is the token.
  if (error) return fail("write_failed", error.code ?? "rpc");

  const response = NextResponse.redirect(`${hub}/?connected=quickbooks`, 303);
  response.cookies.delete({ name: QUICKBOOKS_STATE_COOKIE, path: "/api/oauth/quickbooks" });
  return response;
}
