import { serveClientFile } from "@/lib/files";
import { getVerifiedSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// middleware.ts already sends signed-out requests to /login (/files is not a public path); this re-checks
// the session AND profiles row with Supabase itself, not the middleware header (the filesystem has no RLS), so the
// route fails closed even if the matcher ever changes.
export async function GET(_req: Request, { params }: { params: { path: string[] } }): Promise<Response> {
  const { user, profile } = await getVerifiedSession();
  if (!user || !profile) return new Response("unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  return serveClientFile(params.path);
}
