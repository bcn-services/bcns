"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@bcn-services/tenant";

/**
 * Staff only, and the database decides: `api.staff_switch_client` moves the caller's own
 * data.staff row or raises. The refresh then re-runs the access-token hook, so the cookie
 * carries the new workspace before the next page renders.
 */
export async function switchWorkspace(form: FormData): Promise<void> {
  const supabase = createServerSupabase();
  if (!supabase) redirect("/login?error=unconfigured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=signed-out");

  const { error } = await supabase.schema("api").rpc("staff_switch_client", { p_slug: String(form.get("slug") ?? "") });
  if (error) redirect("/?error=failed");
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  redirect("/");
}
