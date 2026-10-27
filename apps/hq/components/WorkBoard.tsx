"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { cycleOwner, createTaskAction, markDone } from "@/app/(app)/work/actions";
import type { ProposalView } from "@/lib/proposals";
import { AREAS, AREA_LABEL, OWNERS, groupByOwner, type Area } from "@/lib/tasks";
import { ProposalDetail, ProposalTable, useDecide } from "./ProposalDecide";
import { WorkTaskDetail, type WorkLink, type WorkNote, type WorkTask } from "./WorkTaskDetail";
import { useRowKeys } from "./WorkKeys";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CHECK = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/** Work: "Needs you" proposals on top, then tasks by owner then status; detail pane on the right. */
export function WorkBoard(props: {
  head: ReactNode;
  proposals: ProposalView[];
  tasks: WorkTask[];
  notes: Record<string, WorkNote[]>;
  links: Record<string, WorkLink[]>;
  today: string;
}) {
  const { head, proposals, tasks, notes, links, today } = props;
  const groups = groupByOwner(tasks);
  const keys = [
    ...proposals.map((p) => `p:${p.id}`),
    ...groups.flatMap((g) => g.tasks.map((t) => `t:${t.id}`)),
  ];
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const { msg: decideMsg, busy: deciding, decide } = useDecide();
  const detailRef = useRef<HTMLElement>(null);

  const byKey = (k: string | null) =>
    k?.startsWith("t:") ? tasks.find((t) => `t:${t.id}` === k) : undefined;
  const propOf = (k: string | null) =>
    k?.startsWith("p:") ? proposals.find((p) => `p:${p.id}` === k) : undefined;
  const act = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? null : (r.error ?? "failed"));
    });
  const focus = (id: string) => document.getElementById(id)?.focus();

  useRowKeys(
    keys,
    sel,
    setSel,
    {
      a: (k) => propOf(k) && decide(propOf(k)!, true),
      r: (k) => propOf(k) && decide(propOf(k)!, false),
      d: (k) => byKey(k) && act(() => markDone(byKey(k)!.id)),
      o: (k) => byKey(k) && act(() => cycleOwner(byKey(k)!.id, byKey(k)!.owner)),
      w: (k) => byKey(k) && focus("wk-waiting"),
      n: () => focus("wk-new-title"),
    },
    () => detailRef.current?.focus()
  );

  function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    act(async () => {
      const r = await createTaskAction({
        title: String(f.get("title") ?? ""),
        owner: String(f.get("owner")) as (typeof OWNERS)[number],
        area: String(f.get("area") ?? "") || null,
        due: String(f.get("due") ?? "") || null,
      });
      if (r.ok) form.reset();
      return r;
    });
  }

  const sp = propOf(sel);
  const st = byKey(sel);
  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <>
      <div className="cols">
        <section className="lst" aria-label="Work">
          <div className="lpad">
            <h1>Work</h1>
            <p className="date">{open} open · grouped by owner</p>
            {head}
            <form className="newtask acts" onSubmit={addTask}>
              <input
                id="wk-new-title"
                name="title"
                placeholder="New task"
                aria-label="Title"
                required
              />
              <select name="owner" aria-label="Owner" defaultValue="nate">
                {OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {cap(o)}
                  </option>
                ))}
              </select>
              <select name="area" aria-label="Area" defaultValue="">
                <option value="">No area</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABEL[a]}
                  </option>
                ))}
              </select>
              <input type="date" name="due" aria-label="Due" />
              <button className="btn pri sm" disabled={busy}>
                Add <b className="k">n</b>
              </button>
            </form>
            {msg ? (
              <p className="note err" role="alert">
                {msg}
              </p>
            ) : null}
            {decideMsg ? (
              <p className="note" role="status">
                {decideMsg}
              </p>
            ) : null}

            {proposals.length ? (
              <section className="sx">
                <div className="sh">
                  <h2>Needs you</h2>
                  <span className="cnt hot">{proposals.length}</span>
                  <span className="sub">Claude proposed these</span>
                </div>
                <div className="card">
                  <ProposalTable proposals={proposals} sel={sel} onSelect={setSel} />
                </div>
              </section>
            ) : null}

            {groups.map((g) => (
              <section className="sx" key={g.owner}>
                <div className="sh">
                  <h2>{cap(g.owner)}</h2>
                  <span className="cnt">{g.tasks.length}</span>
                </div>
                <div className="card">
                  {g.tasks.length ? (
                    g.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        t={t}
                        today={today}
                        on={sel === `t:${t.id}`}
                        onSelect={() => setSel(`t:${t.id}`)}
                        onDone={() => act(() => markDone(t.id))}
                        onOwner={() => act(() => cycleOwner(t.id, t.owner))}
                      />
                    ))
                  ) : (
                    <div className="empty">Nothing here.</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>
        <main className="detail" aria-label="Details" tabIndex={-1} ref={detailRef}>
          {sp ? (
            <ProposalDetail p={sp} busy={deciding} onDecide={(a) => decide(sp, a)} />
          ) : st ? (
            <WorkTaskDetail task={st} notes={notes[st.id] ?? []} links={links[st.id] ?? []} />
          ) : (
            <div className="dwrap">
              <p className="hint">Press j or click a row to open it here.</p>
            </div>
          )}
        </main>
      </div>
      <footer className="keys">
        <span>
          <b className="k">j</b>
          <b className="k">k</b> move
        </span>
        <span>
          <b className="k">n</b> new
        </span>
        <span>
          <b className="k">d</b> done
        </span>
        <span>
          <b className="k">o</b> owner
        </span>
        <span>
          <b className="k">w</b> waiting on
        </span>
        <span>
          <b className="k">enter</b> detail
        </span>
        <span>
          <b className="k">a</b>
          <b className="k">r</b> approve / reject
        </span>
        <span>
          <b className="k">esc</b> leave
        </span>
      </footer>
    </>
  );
}

function TaskRow(props: {
  t: WorkTask;
  today: string;
  on: boolean;
  onSelect: () => void;
  onDone: () => void;
  onOwner: () => void;
}) {
  const { t, today, on, onSelect, onDone, onOwner } = props;
  const done = t.status === "done";
  const late = !done && !!t.due && t.due < today;
  const meta = [
    t.area ? (AREA_LABEL[t.area as Area] ?? t.area) : null,
    t.due ? `${late ? "overdue" : "due"} ${t.due}` : null,
    t.lead,
    t.waiting_on ? `waiting on ${t.waiting_on}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={`row${on ? " f" : ""}${done ? " done" : ""}`}
      onClick={onSelect}
      aria-current={on ? "true" : undefined}
    >
      <button
        className={`cb${done ? " on" : ""}`}
        aria-label={done ? "Done" : "Mark done"}
        aria-pressed={done}
        disabled={done}
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        {done ? CHECK : null}
      </button>
      <div className="rb">
        <div className="r1">
          <span className="rt">{t.title}</span>
          <span className="rm">
            <span
              className={`chip${t.status === "waiting" ? " warn" : t.status === "doing" ? " stage" : done ? " ok" : ""}`}
            >
              {cap(t.status)}
            </span>
            <button
              className={`chip own ${t.owner ?? ""}`}
              title="Click to cycle owner (o)"
              onClick={(e) => {
                e.stopPropagation();
                onOwner();
              }}
            >
              {cap(t.owner ?? "—")}
            </button>
          </span>
        </div>
        {meta ? <div className={`r2${late ? " bad" : ""}`}>{meta}</div> : null}
      </div>
    </div>
  );
}
