import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";

// POST only: a GET sign-out could be triggered by any <img src>. 303 so the browser follows with a GET.
export async function POST(request: NextRequest): Promise<Response> {
  await createSupabaseServer()?.auth.signOut();
  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  return NextResponse.redirect(to, 303);
}
