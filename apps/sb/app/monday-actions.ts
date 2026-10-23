"use server";

/**
 * monday-actions.ts — the one write SB makes back to a connected system: mark a
 * Monday item Done.
 *
 * It queues a source command through api.enqueue_source_command as the
 * signed-in user (the RPC checks membership and derives the client). The
 * worker applies it to Monday; SB holds no Monday token. queueMarkDone
 * (lib/monday.ts) holds the logic; this wrapper only supplies the client and
 * returns a state the row shows: `{ error: true }` when nothing was queued
 * (RPC missing or raised), so the row says "Couldn’t update" instead of
 * silently reverting.
 */

import { revalidatePath } from "next/cache";
import { getDataClient } from "@/lib/data";
import { queueMarkDone } from "@/lib/monday";

export type MarkDoneState = { error: boolean } | null;

export async function markMondayDone(_prev: MarkDoneState, form: FormData): Promise<MarkDoneState> {
  const ok = await queueMarkDone(await getDataClient(), form.get("item_id"));
  if (ok) revalidatePath("/");
  return { error: !ok };
}
