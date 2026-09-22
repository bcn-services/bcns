"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@bcn-services/tenant";
import { FINISH_PATH } from "@/lib/shopify-oauth";

export async function signIn(form: FormData): Promise<void> {
  const supabase = createServerSupabase();
  if (!supabase) redirect("/login?error=unconfigured");
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  // The middleware does the membership check on the next request, so a user
  // with a valid password but no membership still lands back here with a reason.
  // `next` is an allowlist of one, never a URL we echo: anything else is an open redirect.
  const next = form.get("next") === FINISH_PATH ? FINISH_PATH : null;
  if (error) redirect(next ? `/login?error=invalid&next=${encodeURIComponent(next)}` : "/login?error=invalid");
  redirect(next ?? "/");
}

export async function signOut(): Promise<void> {
  const supabase = createServerSupabase();
  await supabase?.auth.signOut();
  redirect("/login?error=signed-out");
}
