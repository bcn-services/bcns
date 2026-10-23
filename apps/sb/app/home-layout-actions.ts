"use server";

/**
 * home-layout-actions.ts — saves the home page layout through
 * api.set_home_layout as the signed-in user (saveHomeLayout in
 * lib/home-layout.ts holds the logic; the RPC checks membership). `null`
 * resets to the default. Returns false when nothing was saved.
 */

import { revalidatePath } from "next/cache";
import { getDataClient } from "@/lib/data";
import { saveHomeLayout } from "@/lib/home-layout";

export async function saveLayout(layout: unknown): Promise<boolean> {
  const ok = await saveHomeLayout(await getDataClient(), layout);
  if (ok) revalidatePath("/");
  return ok;
}
