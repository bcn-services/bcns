"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { saveShareContact } from "@/lib/ai-settings";
import { requireOwner } from "@/lib/session";

/**
 * Owner-only, re-checked here because a client can post to a server action directly.
 * `api.set_ai_settings` checks the role again in the database.
 */
export async function setShareCustomerContact(form: FormData): Promise<void> {
  const result = await saveShareContact(form, {
    requireOwner: () => requireOwner("/"),
    revalidate: () => revalidatePath("/access"),
  });
  redirect(result.ok ? "/access?ok=saved" : "/access?error=failed");
}
