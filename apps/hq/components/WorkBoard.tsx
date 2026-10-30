"use client";

import { useMemo, useState, useTransition } from "react";
import { cycleOwner, markDone } from "@/app/(app)/work/actions";
import { AREA_LABEL, humanDay, workGroups, type Area } from "@/lib/tasks";
import { buildBoard, type Track } from "@/lib/tracks";
import { NewTaskModal, type ClientOpt } from "./NewTaskModal";
import { TrackBoard } from "./TrackBoard";
import { WorkTaskDetail, type WorkLink, type WorkNote, type WorkTask } from "./WorkTaskDetail";
import { useRowKeys } from "./WorkKeys";

/** Work: tasks by person on the left, the track board on the right; an open task replaces the board. */
export function WorkBoard(props: {
  tasks: WorkTask[];
  tracks: Track[];
  clients: ClientOpt[];
  notes: Record<string, WorkNote[]>;
  links: Record<string, WorkLink[]>;
  today: string;
  admin?: boolean;
  initialTask?: string | null;
}) {
  const { tasks, tracks, clients, notes, links, today } = props;
  const [sel, setSel] = useState<string | null>(props.initialTask ?? null);
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState("");
  const [trackF, setTrackF] = useState("");
  const [clientF, setClientF] = useState("");
  const [ownerF, setOwnerF] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const trackName = useMemo(() => new Map(tracks.map((t) => [t.id, t.name])), [tracks]);
  const clientName = useMemo(
    () => new Map(clients.map((c) => [c.slug, c.display_name])),
    [clients]
  );
  // "" = anyone, "none" = unassigned, else a named owner
  const shown = useMemo(
    () =>
      tasks.filter((t) =>
        !ownerF ? true : ownerF === "none" ? !t.owners.length : t.owners.some((o) => o === ownerF)
      ),
    [tasks, ownerF]
  );
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return workGroups(
      shown.filter(
        (t) =>
          t.status !== "done" &&
          (!needle || t.title.toLowerCase().includes(needle)) &&
          (!trackF || t.track_id === trackF) &&
          (!clientF || t.client_slug === clientF)
      )
    );
  }, [shown, q, trackF, clientF]);
  const board = useMemo(() => buildBoard(tracks, shown), [tracks, shown]);
  const open = tasks.find((t) => t.id === sel);

  const act = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? null : (r.error ?? "failed"));
    });
  const byId = (k: string | null) => tasks.find((t) => t.id === k);

  // The modal owns the keyboard while it is open: the row keys would otherwise act on the task hidden behind it.
  useRowKeys(
    modal ? [] : groups.flatMap((g) => g.tasks.map((t) => t.id)),
    sel,
    modal ? () => {} : setSel,
    modal
      ? {}
      : {
          n: () => setModal(true),
          d: (k) => byId(k) && act(() => markDone(k!)),
          o: (k) => byId(k) && act(() => cycleOwner(k!, byId(k)!.owners)),
          w: (k) => byId(k) && setTimeout(() => document.getElementById("wk-waiting")?.focus(), 0),
        },
    modal ? undefined : () => document.getElementById("wk-board-pane")?.focus()
  );

  return (
    <>
      <div className="wk-lay">
        <section className="wk-l" aria-label="Tasks">
          <div className="wk-top">
            <h1>Work</h1>
            <button className="btn pri" onClick={() => setModal(true)}>
              + New task <b className="k">n</b>
            </button>
          </div>
          <div className="wk-filters">
            <input
              type="search"
              placeholder="Search"
              aria-label="Search tasks"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select aria-label="Track" value={trackF} onChange={(e) => setTrackF(e.target.value)}>
              <option value="">Any track</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Client"
              value={clientF}
              onChange={(e) => setClientF(e.target.value)}
            >
              <option value="">Any client</option>
              {clients.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.display_name}
                </option>
              ))}
            </select>
            <select aria-label="Owner" value={ownerF} onChange={(e) => setOwnerF(e.target.value)}>
              <option value="">Anyone</option>
              <option value="nate">Nate</option>
              <option value="brandon">Brandon</option>
              <option value="claude">Claude</option>
              <option value="none">Unassigned</option>
            </select>
          </div>
          {msg ? (
            <p className="note err" role="alert">
              {msg}
            </p>
          ) : null}
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <div className="wk-sh">
                <h2>{g.label}</h2>
                <span className={`cnt${g.key === "unassigned" ? " wk-warn" : ""}`}>
                  {g.tasks.length}
                </span>
              </div>
              {g.tasks.map((t) => {
                const late = !!t.due && t.due < today;
                const sub = [
                  (t.track_id && trackName.get(t.track_id)) ||
                    (t.area ? (AREA_LABEL[t.area as Area] ?? t.area) : null),
                  t.client_slug ? (clientName.get(t.client_slug) ?? t.client_slug) : t.lead,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={t.id}
                    className={`wk-tr own-${t.owners[0] ?? "none"}${sel === t.id ? " f" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-current={sel === t.id ? "true" : undefined}
                    onClick={() => setSel(sel === t.id ? null : t.id)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && e.key === "Enter") setSel(t.id);
                    }}
                  >
                    <button
                      className="wk-cb"
                      aria-label={`Mark done: ${t.title}`}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (sel === t.id) setSel(null);
                        act(() => markDone(t.id));
                      }}
                    />
                    <div className="wk-tt">
                      <div className="wk-rt">{t.title}</div>
                      <div className="wk-s">{sub || " "}</div>
                    </div>
                    <span className={late ? "wk-od" : "muted"}>
                      {t.due ? humanDay(t.due, today) : ""}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
          {!groups.length ? <p className="muted wk-empty">No open tasks match.</p> : null}
        </section>

        <main className="wk-r" id="wk-board-pane" aria-label="Board" tabIndex={-1}>
          {open ? (
            <WorkTaskDetail
              key={open.id}
              task={open}
              notes={notes[open.id] ?? []}
              links={links[open.id] ?? []}
              tracks={tracks}
              clients={clients}
              admin={props.admin}
              onBack={() => setSel(null)}
            />
          ) : (
            <>
              <div className="wk-bh">
                <h2>Board</h2>
                <span className="sub">click a step to open it</span>
              </div>
              <TrackBoard board={board} onStep={setSel} />
            </>
          )}
        </main>
      </div>
      {modal ? (
        <NewTaskModal tracks={tracks} clients={clients} onClose={() => setModal(false)} />
      ) : null}
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
          <b className="k">enter</b> open
        </span>
        <span>
          <b className="k">esc</b> board
        </span>
      </footer>
    </>
  );
}
