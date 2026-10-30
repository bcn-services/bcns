"use server";

/**
 * Server actions for Work, proposals and the lead/fire task buttons. Each resolves the signed-in
 * HQ user (actor = user id, via='ui') and calls the plain functions in lib/tasks.ts. Server actions
 * are public POST endpoints, so every one re-checks the session; RLS is the second wall.
 * Proposals: decideProposal calls ONLY the decide_proposal RPC. No delete action exists.
 */

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import {
  addLink,
  addListItem,
  addNote,
  createLeadTask,
  createOpsTask,
  createTask,
  nextOwner,
  setListItemStatus,
  updateTask,
  type LeadTaskKind,
  type ListName,
  type ListStatus,
  type NewTask,
  type Owner,
  type TaskPatch,
} from "@/lib/tasks";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function ctx() {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) throw new Error("not signed in");
  return { sb, actor: user.id };
}

async function run(
  fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<string | void>
): Promise<ActionResult> {
  try {
    const id = await fn(await ctx());
    revalidatePath("/work");
    revalidatePath("/");
    return { ok: true, id: id || undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

export async function createTaskAction(t: NewTask): Promise<ActionResult> {
  // source 'lead'/'alert' and alert_key are set only by createTaskFromLead / createTaskFromFire
  const manual: NewTask = { ...t, source: "manual", alertKey: null };
  return run(async (c) => (await createTask(c.sb, c.actor, "ui", manual)).id);
}

export async function updateTaskAction(id: string, patch: TaskPatch): Promise<ActionResult> {
  return run(async (c) => void (await updateTask(c.sb, c.actor, "ui", id, patch)));
}

export async function markDone(id: string): Promise<ActionResult> {
  return updateTaskAction(id, { status: "done" });
}

export async function cycleOwner(id: string, current: Owner[]): Promise<ActionResult> {
  return updateTaskAction(id, { owners: nextOwner(current) });
}

export async function addNoteAction(taskId: string, body: string): Promise<ActionResult> {
  return run(async (c) => void (await addNote(c.sb, c.actor, "ui", { taskId, body })));
}

export async function addLinkAction(
  taskId: string,
  label: string,
  url: string
): Promise<ActionResult> {
  return run(async (c) => void (await addLink(c.sb, c.actor, "ui", { taskId, label, url })));
}

export async function cycleListItem(id: string, next: ListStatus): Promise<ActionResult> {
  return run(async (c) => void (await setListItemStatus(c.sb, c.actor, "ui", id, next)));
}

export async function addListItemAction(list: ListName, business: string): Promise<ActionResult> {
  return run(async (c) => void (await addListItem(c.sb, c.actor, "ui", { list, business })));
}

/** p / q / onboard from a lead (item 3's lead Detail imports this): Claude task due in 3 days. */
export async function createTaskFromLead(
  businessId: string,
  kind: LeadTaskKind
): Promise<ActionResult> {
  return run(async (c) => (await createLeadTask(c.sb, c.actor, "ui", { businessId, kind })).id);
}

/** `c` on a fire: Nate's ops task linked by alert_key (the open one if it exists). */
export async function createTaskFromFire(alertKey: string, title: string): Promise<ActionResult> {
  return run(async (c) => (await createOpsTask(c.sb, c.actor, "ui", { alertKey, title })).id);
}

/** Returns decide_proposal's text: 'approved' | 'rejected' | 'stale', or 'error: …'. */
export async function decideProposal(id: string, approve: boolean): Promise<string> {
  try {
    const { sb } = await ctx();
    const { data, error } = await sb.rpc("decide_proposal", { p_id: id, p_approve: approve });
    if (error) return `error: ${error.message}`;
    revalidatePath("/work");
    revalidatePath("/");
    revalidatePath("/leads");
    return String(data);
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : "failed"}`;
  }
}
