"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@bcn-services/tenant";
import { setPasswordTarget } from "@/lib/auth-link";

export async function setPassword(form: FormData): Promise<void> {
  redirect(
    await setPasswordTarget(
      createServerSupabase(),
      String(form.get("password") ?? ""),
      String(form.get("confirm") ?? "")
    )
  );
}
