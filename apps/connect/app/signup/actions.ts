"use server";

import { notFound, redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { signupTarget } from "@/lib/signup";

/** Server actions are reachable by POST without the page, so the switch is checked here too. */
export async function signUp(form: FormData): Promise<void> {
  const config = getConfig();
  if (!config.signupEnabled) notFound();
  redirect(
    await signupTarget(
      {
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      },
      { supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }
    )
  );
}
