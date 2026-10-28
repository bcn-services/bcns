"use client";

import { useState, useTransition, type ReactNode } from "react";
import { createTaskFromFire, markDone, updateTaskAction } from "@/app/(app)/work/actions";
import type { Fire } from "@/lib/fires";
import type { ProposalView } from "@/lib/proposals";
import { humanDay, OWNERS, type Task } from "@/lib/tasks";
import type { BoardCard, Column, Track } from "@/lib/tracks";
import { HintBar, type Hint } from "./HintBar";
import type { ClientOpt } from "./NewTaskModal";
import { useDecide } from "./ProposalDecide";
import { TrackBoard } from "./TrackBoard";
import { useRowKeys } from "./WorkKeys";
import { WorkTaskDetail, type WorkLink, type WorkNote, type WorkTask } from "./WorkTaskDetail";

export interface ToAssign {
  task: Task;
  /** The track the step belongs to, shown as "from board · <track>". */
  from: string | null;
}

const APPROVE_SHOWN = 5;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Nate's Today, same shape as Work: Approve / Fires / To assign / Your tasks on the left, his day's
 * board on the right; a selected task replaces the board with the Work task detail.
 */
export function TodayNateBoard(props: {
  today: string;
  dateLabel: string;
  proposals: ProposalView[];
  fires: Fire[];
  toAssign: ToAssign[];
  mine: Task[];
  calendar: ReactNode;
  tasks: WorkTask[];
  tracks: Track[];
  clients: ClientOpt[];
  notes: Record<string, WorkNote[]>;
  links: Record<string, WorkLink[]>;
  board: Record<Column, BoardCard[]>;
  boardSub: string;
}) {
  const { today, dateLabel, proposals, fires, toAssign, mine, calendar } = props;
  const { tasks, tracks, clients, notes, links, board, boardSub } = props;
  const shown = proposals.slice(0, APPROVE_SHOWN);
  const keys = [
    ...shown.map((p) => `p:${p.id}`),
    ...fires.map((f) => `f:${f.key}`),
    ...toAssign.map((a) => `a:${a.task.id}`),
    ...mine.map((t) => `m:${t.id}`),
  ];
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const { msg: decideMsg, busy: deciding, decide } = useDecide();

  const prop = shown.find((p) => `p:${p.id}` === sel);
  const fire = fires.find((f) => `f:${f.key}` === sel);
  // a:/m: rows on the left, t: a board step; any of them opens the task on the right
  const task = tasks.find((t) => sel === `a:${t.id}` || sel === `m:${t.id}` || sel === `t:${t.id}`);

  const act = (f: () => Promise<{ ok: boolean; error?: string }>, okMsg: string | null) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? okMsg : (r.error ?? "failed"));
    });
  // `c` on a task:* fire is a no-op: it already is a task
  const makeTask = (f: Fire | undefined) =>
    f &&
    !f.key.startsWith("task:") &&
    act(() => createTaskFromFire(f.key, f.title), "Task created in Work.");

  useRowKeys(keys, sel, setSel, {
    a: () => prop && decide(prop, true),
    r: () => prop && decide(prop, false),
    c: () => makeTask(fire),
    // close the pane too: the task stays in `tasks` after revalidation, so `sel` would keep finding it
    d: () =>
      task &&
      act(async () => {
        const r = await markDone(task.id);
        if (r.ok) setSel(null);
        return r;
      }, null),
  });

  const row = (key: string, title: string, meta?: string, right?: ReactNode) => (
    <div
      key={key}
      className={`row${sel === key ? " f" : ""}`}
      onClick={() => setSel(key)}
      aria-current={sel === key ? "true" : undefined}
    >
      <div className="rb">
        <div className="r1">
          <span className="rt">{title}</span>
          {right ? <span className="rm">{right}</span> : null}
        </div>
        {meta ? <div className="r2">{meta}</div> : null}
      </div>
    </div>
  );
  const section = (title: string, rows: ReactNode[], count: number, hot = false) => (
    <section className="sx">
      <div className="sh">
        <h2>{title}</h2>
        <span className={`cnt${hot && count ? " hot" : ""}`}>{count}</span>
      </div>
      <div className="card">{rows.length ? rows : <div className="empty">Nothing here.</div>}</div>
    </section>
  );
  const dueChip = (t: Task) =>
    t.due ? (
      <span className={`chip${t.due < today ? " bad" : t.due === today ? " warn" : ""}`}>
        {t.due < today ? "overdue" : humanDay(t.due, today)}
      </span>
    ) : null;

  const canDecide = proposals.some((p) => p.canDecide);
  const hints: Hint[] = [
    [["j", "k"], "move"],
    ...(canDecide ? [[["a", "r"], "approve / reject"] as Hint] : []),
    ...(fires.some((f) => !f.key.startsWith("task:")) ? [[["c"], "fire → task"] as Hint] : []),
    ...(toAssign.length || mine.length ? [[["d"], "done"] as Hint] : []),
    [["esc"], "leave"],
  ];

  return (
    <>
      <div className="td-lay">
        <section className="td-l" aria-label="Today">
          <h1>Today</h1>
          <p className="date">{dateLabel}</p>
          {msg ? (
            <p className="note" role="status">
              {msg}
            </p>
          ) : null}
          {decideMsg ? (
            <p className="note" role="status">
              {decideMsg}
            </p>
          ) : null}
          {calendar}
          {section(
            "Approve",
            [
              ...shown.map((p) =>
                row(
                  `p:${p.id}`,
                  `${p.target}: ${p.field} ${p.old} → ${p.next}`,
                  `${p.who}${p.via ? ` (${p.via})` : ""} · ${p.age}`,
                  p.canDecide ? (
                    <span className="ar">
                      <button
                        className="btn sm"
                        disabled={deciding}
                        aria-label={`Approve ${p.target}`}
                        onClick={(e) => (e.stopPropagation(), decide(p, true))}
                      >
                        ✓ <b className="k">a</b>
                      </button>
                      <button
                        className="btn sm"
                        disabled={deciding}
                        aria-label={`Reject ${p.target}`}
                        onClick={(e) => (e.stopPropagation(), decide(p, false))}
                      >
                        ✕ <b className="k">r</b>
                      </button>
                    </span>
                  ) : null
                )
              ),
              ...(proposals.length > shown.length
                ? [
                    <div className="empty" key="more">
                      <a href="/work">{proposals.length - shown.length} more in Work</a>
                    </div>,
                  ]
                : []),
            ],
            proposals.length,
            true
          )}
          {section(
            "Fires",
            fires.map((f) =>
              row(
                `f:${f.key}`,
                f.title,
                f.detail,
                <>
                  <span className={`chip ${f.severity === "urgent" ? "bad" : "warn"}`}>
                    {f.kind}
                  </span>
                  {f.key.startsWith("task:") ? null : (
                    <button
                      className="btn sm"
                      disabled={busy}
                      onClick={(e) => (e.stopPropagation(), makeTask(f))}
                    >
                      → task
                    </button>
                  )}
                </>
              )
            ),
            fires.length,
            true
          )}
          {section(
            "To assign",
            toAssign.map(({ task: t, from }) =>
              row(
                `a:${t.id}`,
                t.title,
                from ? `from board · ${from}` : t.due ? humanDay(t.due, today) : "no date",
                <select
                  className="as"
                  aria-label={`Assign ${t.title}`}
                  value=""
                  disabled={busy}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const owner = OWNERS.find((o) => o === e.target.value);
                    if (owner)
                      act(() => updateTaskAction(t.id, { owner }), `Assigned to ${cap(owner)}.`);
                  }}
                >
                  <option value="">Assign…</option>
                  {OWNERS.map((o) => (
                    <option key={o} value={o}>
                      {cap(o)}
                    </option>
                  ))}
                </select>
              )
            ),
            toAssign.length
          )}
          {section(
            "Your tasks",
            mine.map((t) =>
              row(
                `m:${t.id}`,
                t.title,
                t.waiting_on && t.owner !== "nate"
                  ? `waiting on you · ${t.owner ?? "unassigned"}`
                  : t.waiting_on
                    ? `waiting on ${t.waiting_on}`
                    : undefined,
                <>
                  {t.owner && t.owner !== "nate" ? (
                    <span className={`chip ${t.owner}`}>{cap(t.owner)}</span>
                  ) : null}
                  {dueChip(t)}
                </>
              )
            ),
            mine.length
          )}
        </section>
        <main className="td-r" aria-label="Board">
          {task ? (
            <WorkTaskDetail
              task={task}
              notes={notes[task.id] ?? []}
              links={links[task.id] ?? []}
              tracks={tracks}
              clients={clients}
              onBack={() => setSel(null)}
            />
          ) : (
            <>
              <div className="td-rh">
                <h2>Your day</h2>
                <span className="sub">{boardSub}</span>
              </div>
              <TrackBoard board={board} onStep={(id) => setSel(`t:${id}`)} />
            </>
          )}
        </main>
      </div>
      <HintBar hints={hints} />
    </>
  );
}
