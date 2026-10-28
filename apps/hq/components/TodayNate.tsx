import { loadCalendar } from "@/lib/calendar";
import { getFires } from "@/lib/fires";
import { listPendingProposals } from "@/lib/proposals";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { byDue, isoDay, listTasks } from "@/lib/tasks";
import { buildBoard, COLUMNS, listTracks } from "@/lib/tracks";
import { TodayCalendar } from "./TodayCalendar";
import { TodayNateBoard } from "./TodayNateBoard";
import { TrackBoard } from "./TrackBoard";

/** Nate's Today (v2-today-nate, variant A): what needs him on the left, the track board on the right. */
export async function TodayNate() {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) return null;
  const now = new Date();
  const [proposals, fires, tasks, tracks, cal] = await Promise.all([
    listPendingProposals(sb),
    getFires(),
    listTasks(sb),
    listTracks(sb),
    loadCalendar(user.email ?? ""),
  ]);
  const open = tasks.filter((t) => t.status !== "done");
  const taken = new Set(open.map((t) => t.alert_key).filter(Boolean));
  // proposals have their own Approve section; a fire whose alert already has an open task shows as that task
  const shown = fires.filter((f) => !f.key.startsWith("proposal:") && !taken.has(f.key));
  // a task already listed as a fire (key task:<id>) is not repeated under To assign / Your tasks
  const asFire = new Set(shown.map((f) => f.key));
  const listed = open.filter((t) => !asFire.has(`task:${t.id}`));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const board = buildBoard(tracks, tasks, now);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const stepsDone = tasks.filter(
    (t) => t.status === "done" && Date.parse(t.done_at ?? "") > weekAgo
  ).length;
  const nTracks = COLUMNS.reduce((n, c) => n + board[c].length, 0);

  return (
    <TodayNateBoard
      today={isoDay(now)}
      dateLabel={now.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        month: "short",
        day: "numeric",
      })}
      proposals={proposals}
      fires={shown}
      toAssign={listed
        .filter((t) => !t.owner)
        .sort(byDue)
        .map((t) => ({ task: t, from: t.track_id ? (trackName.get(t.track_id) ?? null) : null }))}
      mine={listed
        .filter((t) => t.owner === "nate" || t.waiting_on?.trim().toLowerCase() === "nate")
        .sort(byDue)}
      calendar={<TodayCalendar cal={cal} now={now} />}
      right={
        <main className="td-r" aria-label="What we're working on">
          <div className="td-rh">
            <h2>What we&apos;re working on</h2>
            <span className="sub">
              {nTracks} track{nTracks === 1 ? "" : "s"} · {stepsDone} step
              {stepsDone === 1 ? "" : "s"} done this week
            </span>
          </div>
          <TrackBoard board={board} />
        </main>
      }
    />
  );
}
