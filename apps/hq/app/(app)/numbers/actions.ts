"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase";
import { createOpsTask } from "@/lib/tasks";
import type { Result } from "./task";

export type ActionResult = Result;

/** Key `c` on a fire: an ops task for Nate (the open one for this fire if it exists, lib/tasks.ts). */
export async function createTaskFromFire(fire: {
  key: string;
  title: string;
  detail?: string;
}): Promise<ActionResult> {
  if (!/^ops:[\w.:@-]{1,160}$/.test(String(fire.key ?? "")))
    return { ok: false, message: "not an ops fire" };
  const sb = createSupabaseServer();
  if (!sb) return { ok: false, message: "not configured" };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { ok: false, message: "signed out" };
  try {
    await createOpsTask(sb, data.user.id, "ui", {
      alertKey: fire.key,
      title: String(fire.title ?? "").slice(0, 200) || fire.key,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "failed" };
  }
  revalidatePath("/numbers");
  return { ok: true, message: "task created" };
}
