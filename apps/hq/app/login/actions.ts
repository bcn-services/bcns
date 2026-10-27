"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase";

export async function signInWithPassword(form: FormData): Promise<void> {
  const supabase = createSupabaseServer();
  if (!supabase) redirect("/login?error=unconfigured");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error || !data.user) redirect("/login?error=invalid");
  // A valid auth user with no profiles row is not HQ staff: the gate would bounce them anyway, so say why.
  const { data: row } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!row) {
    await supabase.auth.signOut();
    redirect("/login?error=no-profile");
  }
  redirect("/");
}
