"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/proposals";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { isSlug } from "@/lib/clients/fields";
import { assertOwners, createTask } from "@/lib/tasks";
import { applyClientUpdate } from "./apply";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Edit a client's whitelisted fields. Admin only; the check is server-side and the database repeats it. */
export async function updateClient(formData: FormData): Promise<ActionResult> {
  const sb = createSupabaseServer();
  if (!sb) return { ok: false, error: "not configured" };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { ok: false, error: "not signed in" };
  const r = await applyClientUpdate(sb, data.user.id, Object.fromEntries(formData), {
    admin: await isAdmin(sb),
  });
  if (!r.ok) console.error(`[clients] edit refused: ${r.reason}`);
  revalidatePath("/clients");
  return r.ok ? { ok: true } : { ok: false, error: r.reason ?? "refused" };
}

/** "+ Task for this client": a task with client_slug set, via='ui'. */
export async function addClientTask(formData: FormData): Promise<ActionResult> {
  try {
    const { user, profile } = await getSession();
    const sb = createSupabaseServer();
    if (!sb || !user || !profile) return { ok: false, error: "not signed in" };
    const slug = String(formData.get("slug") ?? "");
    if (!isSlug(slug)) return { ok: false, error: "bad slug" };
    await createTask(sb, user.id, "ui", {
      title: String(formData.get("title") ?? ""),
      owners: assertOwners(formData.getAll("owner")),
      area: "client",
      clientSlug: slug,
    });
    revalidatePath("/clients");
    revalidatePath("/work");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}
