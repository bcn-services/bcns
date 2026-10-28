import { createSupabaseServer } from "@/lib/supabase";
import { loadCalendar } from "@/lib/calendar";
import { getSession } from "@/lib/session";
import {
  CALLS_LIMIT,
  fmtET,
  leadRow,
  loadBrandonToday,
  loadExtras,
  type Lead,
  type TaskRow,
} from "@/lib/leads";
import type { Section } from "./Board";
import { LeadBody } from "./TodayBrandonLead";
import { LeadBoard } from "./TodayBrandonBoard";
import { TodayBrandonRail } from "./TodayBrandonRail";
import { railStats, type CallLite } from "./TodayBrandonStats";
import { TodayCalendar } from "./TodayCalendar";

// The rail reads his last 45 days of calls (best day, streak, wins), newest first.
// ponytail: PostgREST caps a response at max_rows = 1000 (supabase/config.toml), ~50 business days at his 20-call goal;
// past that the oldest rows drop (today stays right, best day/streak read low). Aggregate per ET day in SQL if he gets there.
const RAIL_DAYS = 45;

const taskDue = (t: TaskRow) =>
  t.status === "waiting" && t.waiting_on
    ? `waiting on ${t.waiting_on}`
    : t.due
      ? `due ${fmtET(`${t.due}T12:00:00Z`)}`
      : "no due date";

/** Today for Brandon: calls (fit-sorted), follow-ups, consults, his tasks; the top call open, his week in the idle pane. */
export async function TodayBrandon({ all = false }: { all?: boolean }) {
  const sb = createSupabaseServer();
  if (!sb) return <p className="lpad muted">Supabase is not configured.</p>;
  const now = new Date();
  const since = new Date(now.getTime() - RAIL_DAYS * 86_400_000).toISOString();
  const [t, cal, callLog] = await Promise.all([
    loadBrandonToday(sb, "brandon", { all }),
    getSession().then(({ user }) => loadCalendar(user?.email ?? "")), // a slow Google never waits behind the DB reads
    sb
      .from("calls")
      .select("at, outcome, businesses(name)")
      .eq("by", "brandon")
      .gte("at", since)
      .order("at", { ascending: false })
      .limit(1000),
  ]);
  if (callLog.error) throw new Error(`calls: ${callLog.error.message}`);
  // untyped client: the select above is the shape; the embed is one business (many-to-one), an array only if PostgREST says so
  const log: CallLite[] = (
    (callLog.data ?? []) as unknown as {
      at: string;
      outcome: string | null;
      businesses: { name: string } | { name: string }[] | null;
    }[]
  ).map((c) => ({
    at: c.at,
    outcome: c.outcome,
    name: Array.isArray(c.businesses) ? c.businesses[0]?.name : c.businesses?.name,
  }));
  const rail = railStats(log, now);
  const leads: Lead[] = [...t.calls, ...t.followups, ...t.consults];
  const extras = await loadExtras(
    sb,
    leads.map((l) => l.id)
  );

  const rows = (ls: Lead[], kind: "call" | "follow" | "consult") =>
    ls.map((l) => leadRow(l, extras.get(l.id), kind));
  const sections: Section[] = [
    {
      id: "calls",
      title: "Calls",
      // the badge counts the rows shown; say how many more there are
      sub:
        t.callsTotal > t.calls.length
          ? `top ${t.calls.length} of ${t.callsTotal} by fit`
          : "by fit",
      rows: rows(t.calls, "call"),
      ...(t.callsTotal > CALLS_LIMIT
        ? {
            more: all
              ? { href: "/", label: "show fewer" }
              : { href: "/?all=1", label: `show all ${t.callsTotal}` },
          }
        : {}),
    },
    {
      id: "follow",
      title: "Follow-ups",
      hot: true,
      ...(t.followupsTotal > t.followups.length
        ? { sub: `${t.followups.length} of ${t.followupsTotal} due` }
        : {}),
      rows: rows(t.followups, "follow"),
    },
    // the proto has no empty Consults card: show the section only when there is one
    ...(t.consults.length
      ? [{ id: "consults", title: "Consults", rows: rows(t.consults, "consult") }]
      : []),
    {
      id: "tasks",
      title: "Your tasks",
      rows: t.tasks.map((k) => ({
        key: `task:${k.id}`,
        title: k.title,
        meta: [k.area, taskDue(k)].filter(Boolean).join(" · "),
      })),
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
  return (
    <div className="tb">
      <div className="tb-main">
        <LeadBoard
          head={null}
          // the top due call is open on arrival, as in the proto; Esc leaves it for the idle pane
          initialKey={leads[0]?.id}
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
                {t.allTime} call{t.allTime === 1 ? "" : "s"} logged all time. Press j or click a row
                to open it here.
              </p>
            </>
          }
        />
      </div>
      <TodayBrandonRail s={rail} calendar={<TodayCalendar cal={cal} now={now} />} />
    </div>
  );
}
