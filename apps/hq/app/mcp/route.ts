import { authorizeMcp, getRuntime } from "../../lib/mcp/auth";
import { clientIp, ipKey, readBody } from "../../lib/mcp/oauth";
import { handleMcp } from "../../lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Matches nginx's client_max_body_size. */
const MAX_BODY_BYTES = 1024 * 1024;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

export async function POST(req: Request): Promise<Response> {
  try {
    const rt = getRuntime();
    const caller = authorizeMcp(req, rt);
    if (caller instanceof Response) return caller;
    rt.oauth.markKnown(ipKey(clientIp(req)));
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw === null) return json(413, { error: "payload_too_large" });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid_json" });
    }
    return await handleMcp(req, caller, body);
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", event: "mcp_failed", message: String(e).slice(0, 200) })
    );
    return json(500, { error: "internal_error" });
  }
}

const notAllowed = () => json(405, { error: "method_not_allowed" }, { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
