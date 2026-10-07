/**
 * POST /api/sources/<source>/disconnect — owner-only, for every source in
 * DISCONNECTABLE (lib/sources.ts; never Shopify). Calls api.disconnect_source, which
 * marks the stored token revoked and disables the schedule; the worker then revokes
 * it upstream where the provider allows it and deletes the client's data for that
 * source (platform/worker/src/disconnect.ts). The hub never reads or revokes the token.
 *
 * Guards in order: POST only, cross-site refused, source allow-list, owner checked
 * here as well as in the database. Not gated on oauthEnabled: an owner can always disconnect.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { ownerSession } from "@/lib/session";
import { isCrossSite } from "@/lib/oauth-state";
import { isDisconnectable } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { source: string } }): Promise<NextResponse> {
  const hub = getConfig().hubBaseUrl;
  if (isCrossSite(request.headers, hub)) {
    console.warn("[connect] disconnect rejected (cross_site)");
    return NextResponse.redirect(`${hub}/?error=disconnect-failed`, 303);
  }
  const source = params.source;
  if (!isDisconnectable(source)) {
    console.warn("[connect] disconnect rejected (source)");
    return NextResponse.redirect(`${hub}/?error=disconnect-failed`, 303);
  }
  const session = await ownerSession();
  if (!session) return NextResponse.redirect(`${hub}/?error=forbidden`, 303);

  const { error } = await session.api.rpc("disconnect_source", { p_source: source });
  if (error) {
    console.error(`[connect] ${source} disconnect failed (${error.code ?? "unknown"})`);
    return NextResponse.redirect(`${hub}/?error=${error.code === "BCNS2" ? "forbidden" : "disconnect-failed"}`, 303);
  }
  return NextResponse.redirect(`${hub}/?disconnected=${source}`, 303);
}
