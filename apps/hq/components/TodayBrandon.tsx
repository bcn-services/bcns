import { createSupabaseServer } from "@/lib/supabase";
import { CALLS_LIMIT, fmtET, leadRow, loadBrandonToday, loadExtras, type Lead, type TaskRow } from "@/lib/leads";
import type { Section } from "./Board";
import { LeadBody } from "./TodayBrandonLead";
import { LeadBoard } from "./TodayBrandonBoard";

const taskDue = (t: TaskRow) =>
  t.status === "waiting" && t.waiting_on ? `waiting on ${t.waiting_on}` : t.due ? `due ${fmtET(`${t.due}T12:00:00Z`)}` : "no due date";

/** Today for Brandon: calls (fit-sorted), follow-ups, consults, his tasks; his week in the idle pane. */
export async function TodayBrandon({ all = false }: { all?: boolean }) {
  const sb = createSupabaseServer();
  if (!sb) return <p className="lpad muted">Supabase is not configured.</p>;
  const t = await loadBrandonToday(sb, "brandon", { all });
  const leads: Lead[] = [...t.calls, ...t.followups, ...t.consults];
  const extras = await loadExtras(sb, leads.map((l) => l.id));

  const rows = (ls: Lead[], kind: "call" | "follow" | "consult") =>
    ls.map((l) => leadRow(l, extras.get(l.id), kind));
  const sections: Section[] = [
    {
      id: "calls",
      title: "Calls",
      // the badge counts the rows shown; say how many more there are
      sub: t.callsTotal > t.calls.length ? `top ${t.calls.length} of ${t.callsTotal} by fit` : "by fit",
      rows: rows(t.calls, "call"),
      ...(t.callsTotal > CALLS_LIMIT
        ? { more: all ? { href: "/", label: "show fewer" } : { href: "/?all=1", label: `show all ${t.callsTotal}` } }
        : {}),
    },
    {
      id: "follow",
      title: "Follow-ups",
      hot: true,
      ...(t.followupsTotal > t.followups.length ? { sub: `${t.followups.length} of ${t.followupsTotal} due` } : {}),
      rows: rows(t.followups, "follow"),
    },
    { id: "consults", title: "Consults", rows: rows(t.consults, "consult") },
    {
      id: "tasks",
      title: "Your tasks",
      rows: t.tasks.map((k) => ({ key: `task:${k.id}`, title: k.title, meta: [k.area, taskDue(k)].filter(Boolean).join(" · ") })),
    },
  ];

  const details: Record<string, React.ReactNode> = {};
  for (const l of leads) details[l.id] = <LeadBody lead={l} x={extras.get(l.id)} />;
  for (const k of t.tasks)
    details[`task:${k.id}`] = (
      <div className="sec">
        {k.body ? <p>{k.body}</p> : null}
        <p className="muted">
          {k.status} · {taskDue(k)}. Edit it on the Work page.
        </p>
      </div>
    );

  const w = t.week;
  const stat = (n: number, label: string) => (
    <span className="stat">
      <b>{n}</b> {label}
    </span>
  );
  return (
    <LeadBoard
      head={
        <>
          <h1>Today, Brandon</h1>
          <p className="date">{fmtET(new Date().toISOString())}</p>
          <div className="stats" aria-label="This week">
            {stat(w.calls, "calls")}
            {stat(w.reached, "reached")}
            {stat(w.consults, "consults")}
          </div>
        </>
      }
      sections={sections}
      details={details}
      idle={
        <>
          <h1>Your week</h1>
          <div className="nums" data-testid="week">
            <div>
              <b>{w.calls}</b>
              <span>calls</span>
            </div>
            <div>
              <b>{w.reached}</b>
              <span>reached</span>
            </div>
            <div>
              <b>{w.consults}</b>
              <span>consults</span>
            </div>
          </div>
          <p className="hint" data-testid="done-count">
            {t.allTime} call{t.allTime === 1 ? "" : "s"} logged all time. Press j or click a row to open it here.
          </p>
        </>
      }
    />
  );
}
