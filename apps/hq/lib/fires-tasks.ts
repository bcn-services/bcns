import type { Fire } from "./fires";
import { listPendingProposals } from "./proposals";
import { getSession } from "./session";
import { createSupabaseServer } from "./supabase";
import { addDays, isoDay } from "./tasks";

/** Fires from work: ops tasks due within 7 days (overdue = urgent) and every pending proposal. [] with no session. */
export async function taskFires(now: Date = new Date()): Promise<Fire[]> {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) return [];
  const today = isoDay(now);
  const [tasks, proposals] = await Promise.all([
    sb
      .from("tasks")
      .select("id, title, due")
      .eq("area", "ops")
      .neq("status", "done")
      .lte("due", addDays(today, 7))
      .order("due"),
    listPendingProposals(sb, now),
  ]);
  const ops = ((tasks.data ?? []) as { id: string; title: string; due: string }[]).map(
    (t): Fire => ({
      key: `task:${t.id}`,
      kind: "task",
      title: t.title,
      detail: t.due < today ? `overdue since ${t.due}` : `due ${t.due}`,
      href: "/work",
      severity: t.due < today ? "urgent" : "warn",
    })
  );
  const props = proposals.map((p): Fire => ({
    key: `proposal:${p.id}`,
    kind: "task",
    title: `Approve ${p.target}: ${p.field} ${p.old} → ${p.next}`,
    detail: `${p.who} · ${p.age}`,
    href: "/work",
    severity: "warn",
  }));
  return [...ops, ...props];
}
