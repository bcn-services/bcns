import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientOpt } from "@/components/NewTaskModal";
import type { WorkLink, WorkNote, WorkTask } from "@/components/WorkTaskDetail";
import { isAdmin } from "./proposals";
import { must, type Task } from "./tasks";
import { listTracks, type Track } from "./tracks";

export interface WorkData {
  tasks: WorkTask[];
  tracks: Track[];
  clients: ClientOpt[];
  notes: Record<string, WorkNote[]>;
  links: Record<string, WorkLink[]>;
  admin: boolean; // shows the task Delete button; deleteTask re-checks
}

/** Everything the task detail pane needs; Work and Today (Nate) both load it. */
export async function loadWorkData(sb: SupabaseClient): Promise<WorkData> {
  const [allRes, tracks, clientRows, noteRows, linkRows, admin] = await Promise.all([
    // same query as listTasks, with the linked lead's name embedded (tasks.business_id -> businesses): no second round trip
    sb
      .from("tasks")
      .select("*, business:businesses(name)")
      .order("created_at", { ascending: false })
      .limit(500),
    listTracks(sb),
    sb.from("clients").select("slug, display_name").order("display_name"),
    // ponytail: newest 500 across all tasks, grouped here; fetch per selected task when this grows.
    sb
      .from("notes")
      .select("id, task_id, body, created_at")
      .not("task_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("links")
      .select("id, task_id, label, url")
      .not("task_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
    isAdmin(sb),
  ]);
  // untyped client: the select above is the shape
  const all = must<(Task & { business: { name: string } | null })[]>(allRes, "tasks");
  const group = <T extends { task_id: string }>(rows: T[] | null) => {
    const out: Record<string, T[]> = {};
    for (const r of rows ?? []) (out[r.task_id] ??= []).push(r);
    return out;
  };
  return {
    tasks: all.map(({ business, ...t }) => ({ ...t, lead: business?.name ?? null })),
    tracks,
    clients: (clientRows.data ?? []) as ClientOpt[],
    notes: group((noteRows.data ?? []) as (WorkNote & { task_id: string })[]),
    links: group((linkRows.data ?? []) as (WorkLink & { task_id: string })[]),
    admin,
  };
}
