import { loadCalendar } from "@/lib/calendar";
import { getFires } from "@/lib/fires";
import { listPendingProposals } from "@/lib/proposals";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";
import { byDue, isoDay, todayQueue } from "@/lib/tasks";
import { buildBoard, COLUMNS, FIXED_TRACKS } from "@/lib/tracks";
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
  // the ticket job owns ticket:platform:<id>; the Connect fire for the same ticket is ops:ticket:<id>
  const isTaken = (key: string) => taken.has(key) || taken.has(key.replace(/^ops:ticket:/, "ticket:platform:"));
  // proposals have their own Approve section; a fire whose alert already has an open task shows as that task
  const shown = fires.filter((f) => !f.key.startsWith("proposal:") && !isTaken(f.key));
  // a task already listed as a fire (key task:<id>) is not repeated under To assign / Your tasks
  const asFire = new Set(shown.map((f) => f.key));
  const listed = open.filter((t) => !asFire.has(`task:${t.id}`));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  // the board is a derived queue of the signed-in person's open tasks (top 8 up, waiting, done in 7 days); buildBoard puts each in its phase column
  // tasks on a track buildBoard skips (name not one of the five) never draw, so they must not take queue slots
  const shownTracks = new Set(
    tracks.filter((t) => (FIXED_TRACKS as readonly string[]).includes(t.name)).map((t) => t.id)
  );
  const q = todayQueue(
    tasks.filter((t) => !t.track_id || shownTracks.has(t.track_id)),
    me,
    today
  );
  const board = buildBoard(tracks, [...q.queue, ...q.waiting, ...q.done], now);
  for (const c of COLUMNS) board[c] = board[c].filter((card) => card.steps.length);
  // count what the board draws (steps on a shown track), not every todayQueue result
  const drawn = new Set(
    COLUMNS.flatMap((c) => board[c].flatMap((card) => card.steps.map((t) => t.id)))
  );
  const count = (list: { id: string }[]) => list.filter((t) => drawn.has(t.id)).length;

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
      boardSub={`${count(q.queue)} up · ${count(q.waiting)} waiting · ${count(q.done)} done`}
    />
  );
}
