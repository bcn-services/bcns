import { getRuntime } from "../../lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (req: Request) => getRuntime().oauth.authorizeGet(req);
export const POST = (req: Request) => getRuntime().oauth.authorizePost(req);
