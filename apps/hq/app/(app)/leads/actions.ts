"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import {
  addLeadNote,
  etLocalToDate,
  logCall,
  updateLead,
  type Actor,
  type Handle,
  type LeadPatch,
  type OutcomeKey,
} from "@/lib/leads";

// Server actions for Brandon's loop: actor = the session user, via = 'ui'. The middleware gate plus RLS
// (is_hq()) already deny outsiders; the check here makes an action fail loudly instead of writing nothing.
async function ctx() {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!user || !profile || !sb) throw new Error("not signed in");
  const actor: Actor = { id: user.id, handle: profile.handle };
  return { sb, actor };
}

export type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

/** Keys 1-4. `consultLocal` is a datetime-local value (New York time), required for 3. */
export async function logOutcome(
  businessId: string,
  n: number,
  opts: { consultLocal?: string; note?: string } = {}
): Promise<Result> {
  return run(async () => {
    if (![1, 2, 3, 4].includes(n)) throw new Error("unknown outcome");
    const consultAt = opts.consultLocal ? etLocalToDate(opts.consultLocal) : null;
    if (opts.consultLocal && !consultAt) throw new Error("bad consult time");
    const { sb, actor } = await ctx();
    await logCall(sb, actor, "ui", { businessId, outcome: n as OutcomeKey, note: opts.note, consultAt });
  });
}

export async function addNote(form: FormData): Promise<void> {
  const { sb, actor } = await ctx();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  await addLeadNote(sb, actor, "ui", { businessId: String(form.get("id") ?? ""), body });
  revalidatePath("/", "layout");
}

export async function reassign(id: string, to: Handle): Promise<Result> {
  return run(async () => {
    const { sb, actor } = await ctx();
    await updateLead(sb, actor, "ui", { id, patch: { assigned_to: to } });
  });
}

/** Detail pane form: assigned_to / stage / waiting_on, whichever fields are present. */
export async function saveLead(form: FormData): Promise<void> {
  const { sb, actor } = await ctx();
  const patch: LeadPatch = {};
  const assigned = form.get("assigned_to");
  const stage = form.get("stage");
  const waiting = form.get("waiting_on");
  if (assigned) patch.assigned_to = String(assigned) as Handle;
  // the select always shows the current stage; only a change is a move (a lead sitting in a refused late stage stays put)
  if (stage && stage !== form.get("stage_was")) patch.stage = String(stage);
  if (waiting !== null) patch.waiting_on = String(waiting).trim() || null;
  if (!Object.keys(patch).length) return;
  await updateLead(sb, actor, "ui", { id: String(form.get("id") ?? ""), patch });
  revalidatePath("/", "layout");
}
