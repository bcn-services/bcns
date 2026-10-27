import type { createSupabaseServer } from "@/lib/supabase";

type Sb = NonNullable<ReturnType<typeof createSupabaseServer>>;
export type Result = { ok: true; message: string } | { ok: false; message: string };

/**
 * An ops task for Nate from a fire (key `c`): one open task per fire key, plus an `events` row.
 * TODO(item 4): replace with createOpsTask from lib/tasks.ts; this is the thin local stand-in.
 */
export async function createOpsTask(
  sb: Sb,
  userId: string,
  fire: { key: string; title: string; detail?: string }
): Promise<Result> {
  const key = String(fire.key ?? "");
  if (!/^ops:[\w.:@-]{1,160}$/.test(key)) return { ok: false, message: "not an ops fire" };

  // A second `c` on the same fire finds the first task instead of adding another.
  const open = await sb
    .from("tasks")
    .select("id")
    .eq("alert_key", key)
    .neq("status", "done")
    .limit(1);
  if (open.error) return { ok: false, message: open.error.message };
  if (open.data?.length) return { ok: true, message: "task already open" };

  const ins = await sb
    .from("tasks")
    .insert({
      title: String(fire.title ?? "").slice(0, 200) || key,
      body: fire.detail ? String(fire.detail).slice(0, 1000) : null,
      owner: "nate",
      area: "ops",
      source: "alert",
      alert_key: key,
      created_by: userId,
      via: "ui",
    })
    .select("id")
    .single();
  if (ins.error) return { ok: false, message: ins.error.message };
  const ev = await sb.from("events").insert({
    job: "tasks",
    kind: "task_created",
    detail: { task_id: ins.data.id, alert_key: key },
    actor: userId,
    via: "ui",
  });
  if (ev.error)
    console.error(`[numbers] task ${ins.data.id} created but event failed: ${ev.error.message}`);
  return { ok: true, message: "task created" };
}
