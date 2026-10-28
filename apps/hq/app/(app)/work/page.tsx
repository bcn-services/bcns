import Link from "next/link";
import "../../work.css";
import { WorkBoard } from "@/components/WorkBoard";
import { WorkLists, type ListItem } from "@/components/WorkLists";
import type { WorkLink, WorkNote, WorkTask } from "@/components/WorkTaskDetail";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { isoDay, listTasks } from "@/lib/tasks";
import { listTracks } from "@/lib/tracks";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function WorkPage({ searchParams }: { searchParams: Params }) {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) return <p className="lpad muted">Sign in to see work.</p>;

  // The Lists view is no longer a tab (the prototype has none); ?tab=lists still renders it.
  if (one(searchParams.tab) === "lists") {
    const r = await sb
      .from("list_items")
      .select("id, list, business, status, notes")
      .order("sort")
      .order("created_at");
    return (
      <div className="lst">
        <div className="lpad">
          <h1>Work lists</h1>
          <p className="date">
            <Link href="/work">← Work</Link>
          </p>
          <WorkLists items={(r.data ?? []) as ListItem[]} />
        </div>
      </div>
    );
  }

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
  const tasks: WorkTask[] = all.map((t) => ({
    ...t,
    lead: t.business_id ? (names.get(t.business_id) ?? null) : null,
  }));

  const group = <T extends { task_id: string }>(rows: T[] | null) => {
    const out: Record<string, T[]> = {};
    for (const r of rows ?? []) (out[r.task_id] ??= []).push(r);
    return out;
  };
  const notes = group((noteRows.data ?? []) as (WorkNote & { task_id: string })[]);
  const links = group((linkRows.data ?? []) as (WorkLink & { task_id: string })[]);
  const want = one(searchParams.task);

  return (
    <WorkBoard
      tasks={tasks}
      tracks={tracks}
      clients={(clientRows.data ?? []) as { slug: string; display_name: string }[]}
      notes={notes}
      links={links}
      today={isoDay(new Date())}
      initialTask={tasks.some((t) => t.id === want) ? want : null}
    />
  );
}
