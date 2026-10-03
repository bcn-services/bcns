/**
 * POST /api/oauth/quickbooks/disconnect — owner-only. Calls api.disconnect_source,
 * which marks the stored token revoked and disables the schedule; the worker then
 * revokes it at Intuit and deletes the client's QuickBooks data
 * (platform/worker/src/disconnect.ts). The hub never reads or revokes the token.
 *
 * Same guards as ../start: POST, cross-site refused, owner checked here as well as
 * in the database. Not gated on oauthEnabled: an owner can always disconnect.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { ownerSession } from "@/lib/session";
import { isCrossSite } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const hub = getConfig().hubBaseUrl;
  if (isCrossSite(request.headers, hub)) {
    console.warn("[connect] quickbooks disconnect rejected (cross_site)");
    return NextResponse.redirect(`${hub}/?error=disconnect-failed`, 303);
  }
  const session = await ownerSession();
  if (!session) return NextResponse.redirect(`${hub}/?error=forbidden`, 303);

  const { error } = await session.api.rpc("disconnect_source", { p_source: "quickbooks" });
  if (error) {
    console.error(`[connect] quickbooks disconnect failed (${error.code ?? "unknown"})`);
    return NextResponse.redirect(`${hub}/?error=${error.code === "BCNS2" ? "forbidden" : "disconnect-failed"}`, 303);
  }
  return NextResponse.redirect(`${hub}/?disconnected=quickbooks`, 303);
}
