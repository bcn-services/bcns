"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { callFunction, requireOwner } from "@/lib/session";

/** Deliberately loose: the real check is GoTrue's, one round trip later. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite runs in the `invite-member` Edge Function, not here: it needs the
 * service role, and the whole point of chunk 4 is that the service-role key
 * never lands on the droplet. The function re-derives the client id from the
 * caller's own membership, so nothing this app sends can retarget it.
 */
export async function inviteMember(form: FormData): Promise<void> {
  const { supabase } = await requireOwner("/team");
  const email = String(form.get("email") ?? "").trim();
  if (!EMAIL.test(email)) redirect("/team?error=invalid-email");

  const result = await callFunction(supabase, "invite-member", { email });
  if (!result.ok) {
    redirect(`/team?error=${result.status === 503 ? "unconfigured" : "failed"}`);
  }
  revalidatePath("/team");
  redirect("/team?ok=invited");
}

/** `api.remove_member` re-checks the owner role in the database itself. */
export async function removeMember(form: FormData): Promise<void> {
  const { api } = await requireOwner("/team");
  const targetUserId = String(form.get("user_id") ?? "");
  if (!targetUserId) redirect("/team?error=failed");

  const { error } = await api.rpc("remove_member", { target_user_id: targetUserId });
  if (error) {
    // BCNS3 carries the reason in `detail`; BCNS4 is "already gone".
    const reason =
      error.details === "self" ? "self" : error.details === "smoke" ? "smoke" : error.code === "BCNS4" ? "not-found" : "failed";
    redirect(`/team?error=${reason}`);
  }
  revalidatePath("/team");
  redirect("/team?ok=removed");
}
