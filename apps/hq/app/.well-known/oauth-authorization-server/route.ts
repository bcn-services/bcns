import { getRuntime } from "../../../lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = () => getRuntime().oauth.authorizationServer();
