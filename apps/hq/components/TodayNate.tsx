import { loadCalendar } from "@/lib/calendar";
import { getFires } from "@/lib/fires";
import { listPendingProposals } from "@/lib/proposals";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { byDue, isoDay, todaySteps } from "@/lib/tasks";
import { buildBoard, COLUMNS } from "@/lib/tracks";
import { loadWorkData } from "@/lib/work-data";
import { TodayCalendar } from "./TodayCalendar";
import { TodayNateBoard } from "./TodayNateBoard";

/** Nate's Today (v2-today-nate, variant A): what needs him on the left, his day's board on the right. */
export async function TodayNate() {
  const { user, profile } = await getSession();
  const sb = createSupabaseServer();
  if (!sb || !user || !profile) return null;
  const now = new Date();
  const today = isoDay(now);
  const me = profile.handle ?? "nate";
  const [proposals, fires, data, cal] = await Promise.all([
    listPendingProposals(sb),
    getFires(),
    loadWorkData(sb),
    loadCalendar(user.email ?? ""),
  ]);
  const { tasks, tracks } = data;
  const open = tasks.filter((t) => t.status !== "done");
  const taken = new Set(open.map((t) => t.alert_key).filter(Boolean));
  // proposals have their own Approve section; a fire whose alert already has an open task shows as that task
  const shown = fires.filter((f) => !f.key.startsWith("proposal:") && !taken.has(f.key));
  // a task already listed as a fire (key task:<id>) is not repeated under To assign / Your tasks
  const asFire = new Set(shown.map((f) => f.key));
  const listed = open.filter((t) => !asFire.has(`task:${t.id}`));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  // the board is only today's steps for the signed-in person; tracks with none drop out
  const steps = todaySteps(tasks, me, today);
  const board = buildBoard(tracks, steps, now);
  for (const c of COLUMNS) board[c] = board[c].filter((card) => card.steps.length);
  // count what the board draws (steps on a shown track), not every todaySteps result
  const onBoard = COLUMNS.flatMap((c) => board[c].flatMap((card) => card.steps));
  const stepsDone = onBoard.filter((t) => t.status === "done").length;

  return (
    <TodayNateBoard
      {...data}
      today={today}
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
        .filter((t) => t.owner === me || t.waiting_on?.trim().toLowerCase() === me)
        .sort(byDue)}
      calendar={<TodayCalendar cal={cal} now={now} />}
      board={board}
      boardSub={`${onBoard.length} step${onBoard.length === 1 ? "" : "s"} · ${stepsDone} done`}
    />
  );
}
