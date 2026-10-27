"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase";
import { applyClientUpdate } from "./apply";

/** Edit a client's health / stage / owner / billing note (logic in ./apply.ts). */
export async function updateClient(formData: FormData): Promise<void> {
  const sb = createSupabaseServer();
  if (!sb) return;
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  const r = await applyClientUpdate(sb, data.user.id, Object.fromEntries(formData));
  if (!r.ok) console.error(`[clients] edit refused: ${r.reason}`);
  revalidatePath("/clients");
}
