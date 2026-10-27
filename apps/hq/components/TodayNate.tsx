import { getFires } from "@/lib/fires";
import { listPendingProposals } from "@/lib/proposals";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { byDue, isoDay, listTasks } from "@/lib/tasks";
import { TodayNateBoard, type TodayClient } from "./TodayNateBoard";

/** Nate's Today: approvals, fires, what's waiting on him, his tasks, clients, numbers (item 6 fills the strip). */
export async function TodayNate() {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) return null;
  const [proposals, fires, tasks, clients] = await Promise.all([
    listPendingProposals(sb),
    getFires(),
    listTasks(sb),
    sb
      .from("clients")
      .select("slug, display_name, kind, stage, health, owner")
      .is("churn_date", null)
      .order("display_name"),
  ]);
  const open = tasks.filter((t) => t.status !== "done");
  const taken = new Set(open.map((t) => t.alert_key).filter(Boolean));
  // proposals have their own Approve section; a fire whose alert already has an open task shows as that task
  const shown = fires.filter((f) => !f.key.startsWith("proposal:") && !taken.has(f.key));
  // a task already listed as a fire (key task:<id>) is not repeated under Your tasks
  const asFire = new Set(shown.map((f) => f.key));
  const mine = open.filter((t) => t.owner === "nate" && !asFire.has(`task:${t.id}`)).sort(byDue);
  return (
    <TodayNateBoard
      today={isoDay(new Date())}
      proposals={proposals}
      fires={shown}
      waiting={open.filter((t) => t.waiting_on?.trim().toLowerCase() === "nate").sort(byDue)}
      mine={mine}
      clients={(clients.data ?? []) as TodayClient[]}
    />
  );
}
