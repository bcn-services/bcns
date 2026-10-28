import Link from "next/link";
import "../../work.css";
import { WorkBoard } from "@/components/WorkBoard";
import { WorkLists, type ListItem } from "@/components/WorkLists";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { isoDay } from "@/lib/tasks";
import { loadWorkData } from "@/lib/work-data";

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

  const data = await loadWorkData(sb);
  const want = one(searchParams.task);

  return (
    <WorkBoard
      {...data}
      today={isoDay(new Date())}
      initialTask={data.tasks.some((t) => t.id === want) ? want : null}
    />
  );
}
