"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { createTaskFromFire, markDone } from "@/app/(app)/work/actions";
import type { Fire } from "@/lib/fires";
import type { ProposalView } from "@/lib/proposals";
import { AREA_LABEL, type Area, type Task } from "@/lib/tasks";
import { ProposalDetail, ProposalTable, useDecide } from "./ProposalDecide";
import { useRowKeys } from "./WorkKeys";

export interface TodayClient {
  slug: string;
  display_name: string;
  kind: string | null;
  stage: string | null;
  health: "green" | "amber" | "red" | null;
  owner: string | null;
}

const HEALTH = { green: "ok", amber: "warn", red: "bad" } as const;
const APPROVE_SHOWN = 5;

export function TodayNateBoard(props: {
  today: string;
  proposals: ProposalView[];
  fires: Fire[];
  waiting: Task[];
  mine: Task[];
  clients: TodayClient[];
}) {
  const { today, proposals, fires, waiting, mine, clients } = props;
  const shown = proposals.slice(0, APPROVE_SHOWN);
  const keys = [
    ...shown.map((p) => `p:${p.id}`),
    ...fires.map((f) => `f:${f.key}`),
    ...waiting.map((t) => `w:${t.id}`),
    ...mine.map((t) => `m:${t.id}`),
    ...clients.map((c) => `c:${c.slug}`),
  ];
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const { msg: decideMsg, busy: deciding, decide } = useDecide();
  const detailRef = useRef<HTMLElement>(null);

  const prop = shown.find((p) => `p:${p.id}` === sel);
  const fire = fires.find((f) => `f:${f.key}` === sel);
  const task = [...waiting, ...mine].find((t) => `w:${t.id}` === sel || `m:${t.id}` === sel);
  const client = clients.find((c) => `c:${c.slug}` === sel);

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

  useRowKeys(
    keys,
    sel,
    setSel,
    {
      a: () => prop && decide(prop, true),
      r: () => prop && decide(prop, false),
      c: () => makeTask(fire),
      d: () => task && act(() => markDone(task.id), null),
    },
    () => detailRef.current?.focus()
  );

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
  const taskRow = (pre: string, t: Task) =>
    row(
      `${pre}:${t.id}`,
      t.title,
      [
        t.area ? (AREA_LABEL[t.area as Area] ?? t.area) : null,
        t.due ? `${t.due < today ? "overdue" : "due"} ${t.due}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      <span className={`chip${t.due && t.due < today ? " bad" : ""}`}>{t.status}</span>
    );
  const section = (
    title: string,
    rows: ReactNode[],
    count: number,
    hot = false,
    extra?: ReactNode
  ) => (
    <section className="sx">
      <div className="sh">
        <h2>{title}</h2>
        <span className={`cnt${hot && count ? " hot" : ""}`}>{count}</span>
      </div>
      <div className="card">
        {extra ?? (rows.length ? rows : <div className="empty">Nothing here.</div>)}
      </div>
    </section>
  );

  return (
    <>
      <div className="cols">
        <section className="lst" aria-label="Today">
          <div className="lpad">
            <h1>Today, Nate</h1>
            <p className="date">
              {proposals.length} to approve · {fires.length} fires
            </p>
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
            {section(
              "Approve",
              [],
              proposals.length,
              true,
              shown.length ? (
                <>
                  <ProposalTable proposals={shown} sel={sel} onSelect={setSel} />
                  {proposals.length > shown.length ? (
                    <div className="empty">
                      <a href="/work">{proposals.length - shown.length} more in Work</a>
                    </div>
                  ) : null}
                </>
              ) : undefined
            )}
            {section(
              "Fires",
              fires.map((f) =>
                row(
                  `f:${f.key}`,
                  f.title,
                  f.detail,
                  <span className={`chip ${f.severity === "urgent" ? "bad" : "warn"}`}>
                    {f.severity}
                  </span>
                )
              ),
              fires.length,
              true
            )}
            {section(
              "Waiting on you",
              waiting.map((t) => taskRow("w", t)),
              waiting.length,
              true
            )}
            {section(
              "Your tasks",
              mine.map((t) => taskRow("m", t)),
              mine.length
            )}
            {section(
              "Clients",
              clients.map((c) =>
                row(
                  `c:${c.slug}`,
                  c.display_name,
                  [c.kind, c.stage].filter(Boolean).join(" · "),
                  c.health ? <span className={`chip ${HEALTH[c.health]}`}>{c.health}</span> : null
                )
              ),
              clients.length
            )}
            <section className="sx">
              <div className="sh">
                <h2>Numbers</h2>
              </div>
              <div className="card">
                <div className="empty" data-testid="numbers-strip">
                  Numbers arrive with the money item.
                </div>
              </div>
            </section>
          </div>
        </section>
        <main className="detail" aria-label="Details" tabIndex={-1} ref={detailRef}>
          {prop ? (
            <ProposalDetail p={prop} busy={deciding} onDecide={(a) => decide(prop, a)} />
          ) : fire ? (
            <div className="dwrap">
              <div className="chips">
                <span className={`chip ${fire.severity === "urgent" ? "bad" : "warn"}`}>
                  {fire.severity}
                </span>
                <span className="chip">{fire.kind}</span>
              </div>
              <h1>{fire.title}</h1>
              {fire.detail ? <p className="sub2">{fire.detail}</p> : null}
              <div className="sec acts">
                {fire.href ? (
                  <a className="btn" href={fire.href}>
                    Open
                  </a>
                ) : null}
                {fire.key.startsWith("task:") ? null : (
                  <button className="btn pri" disabled={busy} onClick={() => makeTask(fire)}>
                    Create task <b className="k">c</b>
                  </button>
                )}
              </div>
            </div>
          ) : task ? (
            <div className="dwrap">
              <div className="chips">
                {task.area ? (
                  <span className="chip">{AREA_LABEL[task.area as Area] ?? task.area}</span>
                ) : null}
                <span className="chip stage">{task.status}</span>
              </div>
              <h1>{task.title}</h1>
              <p className="sub2">
                {task.due ? `due ${task.due}` : "no due date"}
                {task.waiting_on ? ` · waiting on ${task.waiting_on}` : ""}
              </p>
              {task.body ? (
                <div className="sec">
                  <p>{task.body}</p>
                </div>
              ) : null}
              <div className="sec acts">
                <button
                  className="btn pri"
                  disabled={busy}
                  onClick={() => act(() => markDone(task.id), null)}
                >
                  Done <b className="k">d</b>
                </button>
                <a className="btn" href="/work">
                  Open in Work
                </a>
              </div>
            </div>
          ) : client ? (
            <div className="dwrap">
              <div className="chips">
                {client.health ? (
                  <span className={`chip ${HEALTH[client.health]}`}>{client.health}</span>
                ) : null}
                {client.stage ? <span className="chip stage">{client.stage}</span> : null}
              </div>
              <h1>{client.display_name}</h1>
              <p className="sub2">{[client.kind, client.owner].filter(Boolean).join(" · ")}</p>
            </div>
          ) : (
            <div className="dwrap">
              <p className="hint">Nothing waiting. Enjoy the quiet.</p>
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
          <b className="k">a</b>
          <b className="k">r</b> approve / reject
        </span>
        <span>
          <b className="k">c</b> fire → task
        </span>
        <span>
          <b className="k">d</b> done
        </span>
        <span>
          <b className="k">esc</b> leave
        </span>
      </footer>
    </>
  );
}
