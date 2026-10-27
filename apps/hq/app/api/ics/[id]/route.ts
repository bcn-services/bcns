import { icsResponse } from "@/lib/ics";
import { createSupabaseServer } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const sb = createSupabaseServer();
  if (!sb) return new Response("unconfigured", { status: 503 });
  return icsResponse(sb, params.id);
}
