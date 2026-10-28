import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientOpt } from "@/components/NewTaskModal";
import type { WorkLink, WorkNote, WorkTask } from "@/components/WorkTaskDetail";
import { listTasks } from "./tasks";
import { listTracks, type Track } from "./tracks";

export interface WorkData {
  tasks: WorkTask[];
  tracks: Track[];
  clients: ClientOpt[];
  notes: Record<string, WorkNote[]>;
  links: Record<string, WorkLink[]>;
}

/** Everything the task detail pane needs; Work and Today (Nate) both load it. */
export async function loadWorkData(sb: SupabaseClient): Promise<WorkData> {
  const [all, tracks, clientRows, noteRows, linkRows] = await Promise.all([
    listTasks(sb),
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
  ]);
  const bizIds = [...new Set(all.map((t) => t.business_id).filter((x): x is string => !!x))];
  const biz = bizIds.length
    ? await sb.from("businesses").select("id, name").in("id", bizIds)
    : { data: [] };
  const names = new Map(
    ((biz.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
  );
  const group = <T extends { task_id: string }>(rows: T[] | null) => {
    const out: Record<string, T[]> = {};
    for (const r of rows ?? []) (out[r.task_id] ??= []).push(r);
    return out;
  };
  return {
    tasks: all.map((t) => ({
      ...t,
      lead: t.business_id ? (names.get(t.business_id) ?? null) : null,
    })),
    tracks,
    clients: (clientRows.data ?? []) as ClientOpt[],
    notes: group((noteRows.data ?? []) as (WorkNote & { task_id: string })[]),
    links: group((linkRows.data ?? []) as (WorkLink & { task_id: string })[]),
  };
}
