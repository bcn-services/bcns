import { getRuntime } from "../../lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (req: Request) => getRuntime().oauth.token(req);
