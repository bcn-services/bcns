import Link from "next/link";
import { WorkBoard } from "@/components/WorkBoard";
import { WorkLists, type ListItem } from "@/components/WorkLists";
import type { WorkLink, WorkNote, WorkTask } from "@/components/WorkTaskDetail";
import { listPendingProposals } from "@/lib/proposals";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { AREAS, AREA_LABEL, OWNERS, STATUSES, filterTasks, isoDay, listTasks } from "@/lib/tasks";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function WorkPage({ searchParams }: { searchParams: Params }) {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) return <p className="lpad muted">Sign in to see work.</p>;
  const lists = one(searchParams.tab) === "lists";
  const tabs = (
    <nav className="chips wtabs" aria-label="Work views">
      <Link className={`chip${lists ? "" : " stage"}`} href="/work">
        Tasks
      </Link>
      <Link className={`chip${lists ? " stage" : ""}`} href="/work?tab=lists">
        Lists
      </Link>
    </nav>
  );

  if (lists) {
    const r = await sb
      .from("list_items")
      .select("id, list, business, status, notes")
      .order("sort")
      .order("created_at");
    return (
      <div className="lst">
        <div className="lpad">
          <h1>Work</h1>
          {tabs}
          <WorkLists items={(r.data ?? []) as ListItem[]} />
        </div>
      </div>
    );
  }

  const f = {
    area: one(searchParams.area),
    status: one(searchParams.status),
    owner: one(searchParams.owner),
  };
  const [proposals, all, noteRows, linkRows] = await Promise.all([
    listPendingProposals(sb),
    listTasks(sb),
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
  const shown = filterTasks(all, f);
  const bizIds = [...new Set(shown.map((t) => t.business_id).filter((x): x is string => !!x))];
  const biz = bizIds.length
    ? await sb.from("businesses").select("id, name").in("id", bizIds)
    : { data: [] };
  const names = new Map(
    ((biz.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
  );
  const tasks: WorkTask[] = shown.map((t) => ({
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

  const head = (
    <>
      {tabs}
      <form className="filters acts" method="get" action="/work">
        <Filter
          name="area"
          value={f.area}
          all="All areas"
          options={AREAS.map((a) => [a, AREA_LABEL[a]])}
        />
        <Filter
          name="status"
          value={f.status}
          all="Open"
          options={[...STATUSES.map((s) => [s, s]), ["all", "Everything"]]}
        />
        <Filter name="owner" value={f.owner} all="Anyone" options={OWNERS.map((o) => [o, o])} />
        <button className="btn sm">Filter</button>
      </form>
    </>
  );

  return (
    <WorkBoard
      head={head}
      proposals={proposals}
      tasks={tasks}
      notes={notes}
      links={links}
      today={isoDay(new Date())}
    />
  );
}

function Filter(p: { name: string; value: string; all: string; options: string[][] }) {
  return (
    <select name={p.name} defaultValue={p.value} aria-label={p.name}>
      <option value="">{p.all}</option>
      {p.options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
