"use server";

import { revalidatePath } from "next/cache";
import { freezeMonth } from "@/lib/finance";
import { createSupabaseServer } from "@/lib/supabase";
import { loadFinance } from "./data";
import { createOpsTask, type Result } from "./task";

export type ActionResult = Result;

/** Freeze one month into finance_snapshots. Insert only: an existing row refuses (23505), and 0030 revokes UPDATE from authenticated. */
export async function freezeMonthAction(formData: FormData): Promise<void> {
  const month = String(formData.get("month") ?? "");
  const sb = createSupabaseServer();
  if (!sb) return;
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  // The rows are recomputed here from the database, never taken from the browser.
  const now = new Date();
  const { live, from } = await loadFinance(sb, now);
  const r = await freezeMonth(
    async (row) => (await sb.from("finance_snapshots").insert(row)).error,
    month,
    live,
    { from, now }
  );
  if (!r.ok) console.error(`[numbers] freeze ${month} refused: ${r.reason}`);
  else
    await sb.from("events").insert({
      job: "finance",
      kind: "snapshot",
      detail: { month },
      actor: data.user.id,
      via: "ui",
    });
  revalidatePath("/numbers");
}

/** Key `c` on a fire: an ops task for Nate (logic in ./task.ts). */
export async function createTaskFromFire(fire: {
  key: string;
  title: string;
  detail?: string;
}): Promise<ActionResult> {
  const sb = createSupabaseServer();
  if (!sb) return { ok: false, message: "not configured" };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { ok: false, message: "signed out" };
  const r = await createOpsTask(sb, data.user.id, fire);
  if (r.ok) revalidatePath("/numbers");
  return r;
}
