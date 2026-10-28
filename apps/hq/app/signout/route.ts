import type { NextRequest } from "next/server";
import { toLogin } from "@/lib/gate";
import { hardenCookie } from "@/lib/cookie-options";
import { revokeMcpTokens } from "@/lib/mcp/auth";
import { createSupabaseServer } from "@/lib/supabase";

// POST only: a GET sign-out could be triggered by any <img src>. 303 so the browser follows with a GET.
export async function POST(request: NextRequest): Promise<Response> {
  const sb = createSupabaseServer();
  // The MCP connector's tokens die with the session. Never blocks the sign-out.
  if (sb)
    await revokeMcpTokens(sb).catch((e) =>
      console.error(
        JSON.stringify({
          level: "error",
          event: "mcp_revoke_failed",
          message: String(e).slice(0, 200),
        })
      )
    );
  await sb?.auth.signOut();
  const res = toLogin(request, 303);
  // signOut() returns before clearing anything when Supabase is unreachable or 5xx: expire the session ourselves.
  request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .forEach((c) => res.cookies.set(c.name, "", hardenCookie({ maxAge: 0, expires: new Date(0) })));
  return res;
}
