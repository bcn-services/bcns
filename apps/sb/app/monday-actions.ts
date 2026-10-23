"use server";

/**
 * monday-actions.ts — the one write SB makes: mark a Monday item Done.
 *
 * It queues a source command through api.enqueue_source_command as the
 * signed-in user (the RPC checks membership and derives the client). The
 * worker applies it to Monday; SB holds no Monday token. The item must be one
 * the user's own jobs_v1 (RLS-scoped) shows as a not-done Monday task, so the
 * action cannot be pointed at an arbitrary id.
 *
 * Errors are logged and swallowed: the page re-renders from source_commands_v1
 * and the row simply reverts when nothing was queued.
 */

import { revalidatePath } from "next/cache";
import { getDataClient } from "@/lib/data";
import { isMondayItemId, MARK_DONE_KIND } from "@/lib/monday";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function markMondayDone(form: FormData): Promise<void> {
  const itemId = form.get("item_id");
  if (!isMondayItemId(itemId)) return;
  const client = await getDataClient();
  const supabase = createSupabaseServer();
  if (!client || !supabase) return;
  try {
    const { data, error } = await client.views
      .jobs_v1()
      .eq("source", "monday")
      .eq("external_id", itemId)
      .eq("is_done", false)
      .is("deleted_at", null)
      .limit(1);
    if (error || !data?.length) return;
    // Contract: api.enqueue_source_command is not in database.types.ts until it is regenerated after B's db push.
    const { error: rpcError } = await supabase.schema("api").rpc("enqueue_source_command", {
      p_source: "monday",
      p_kind: MARK_DONE_KIND,
      p_payload: { item_id: itemId },
    });
    if (rpcError) console.error("monday: enqueue_source_command failed", rpcError.message);
  } catch (err) {
    console.error("monday: mark done failed", err instanceof Error ? err.message : err);
  } finally {
    revalidatePath("/");
  }
}
