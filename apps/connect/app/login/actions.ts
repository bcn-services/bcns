"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@bcn-services/tenant";

export async function signIn(form: FormData): Promise<void> {
  const supabase = createServerSupabase();
  if (!supabase) redirect("/login?error=unconfigured");
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  // The middleware does the membership check on the next request, so a user
  // with a valid password but no membership still lands back here with a reason.
  redirect(error ? "/login?error=invalid" : "/");
}

export async function signOut(): Promise<void> {
  const supabase = createServerSupabase();
  await supabase?.auth.signOut();
  redirect("/login?error=signed-out");
}
