import { handleExport } from "@/lib/data-csv";
import { toDataApi } from "@/lib/data-query";
import { memberSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /data/export?source&view&from&to&q -> CSV. Signed out is a 401, not a redirect
 * (middleware already bounces browsers to /login; this is the check for anything that
 * reaches the handler anyway). Reads go through the caller's own RLS-scoped session.
 */
export async function GET(request: Request): Promise<Response> {
  return handleExport(request, {
    getSession: async () => {
      const session = await memberSession();
      return session ? { api: toDataApi(session.api) } : null;
    },
  });
}
