import { serveClientFile } from "@/lib/files";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// middleware.ts already sends signed-out requests to /login (/files is not a public path); this re-checks
// the session AND profiles row so the route fails closed even if the matcher ever changes.
export async function GET(_req: Request, { params }: { params: { path: string[] } }): Promise<Response> {
  const { user, profile } = await getSession();
  if (!user || !profile) return new Response("unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  return serveClientFile(params.path);
}
