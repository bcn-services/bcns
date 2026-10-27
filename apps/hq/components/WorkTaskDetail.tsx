"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addLinkAction, addNoteAction, updateTaskAction } from "@/app/(app)/work/actions";
import {
  AREA_LABEL,
  OWNERS,
  STATUSES,
  waitingStatus,
  type Area,
  type Status,
  type Task,
} from "@/lib/tasks";

export interface WorkTask extends Task {
  lead: string | null; // linked business name
}
export interface WorkNote {
  id: string;
  body: string;
  created_at: string;
}
export interface WorkLink {
  id: string;
  label: string | null;
  url: string;
}

/** Detail pane for a task: edit fields, notes, links, linked lead / client. */
export function WorkTaskDetail({
  task,
  notes,
  links,
}: {
  task: WorkTask;
  notes: WorkNote[];
  links: WorkLink[];
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit(
    e: FormEvent<HTMLFormElement>,
    call: (f: FormData) => Promise<{ ok: boolean; error?: string }>
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    start(async () => {
      const r = await call(f);
      setMsg(r.ok ? "Saved." : (r.error ?? "failed"));
      if (r.ok && form.dataset.reset) form.reset();
    });
  }
  const s = (f: FormData, k: string) => String(f.get(k) ?? "");

  return (
    <div className="dwrap">
      <div className="chips">
        {task.area ? (
          <span className="chip">{AREA_LABEL[task.area as Area] ?? task.area}</span>
        ) : null}
        <span className="chip stage">{task.source}</span>
        {task.alert_key ? <span className="chip warn">alert {task.alert_key}</span> : null}
      </div>
      <h1>{task.title}</h1>
      <p className="sub2">
        {task.lead ? (
          <>
            Lead: <a href="/leads">{task.lead}</a>
          </>
        ) : null}
        {task.client_slug ? <>Client: {task.client_slug}</> : null}
      </p>

      <form
        className="sec tform"
        key={`${task.id}${task.status}${task.owner}${task.due}${task.waiting_on}${task.body}`}
        onSubmit={(e) =>
          submit(e, (f) => {
            const waiting = s(f, "waiting_on");
            // status follows waiting_on only when the waiting text itself changed
            const status =
              (s(f, "status") as Status) !== task.status
                ? (s(f, "status") as Status)
                : waiting.trim() !== (task.waiting_on ?? "").trim()
                  ? (waitingStatus(waiting, task.status) ?? task.status)
                  : task.status;
            return updateTaskAction(task.id, {
              status,
              owner: s(f, "owner") as (typeof OWNERS)[number],
              due: s(f, "due") || null,
              waiting_on: waiting || null,
              body: s(f, "body") || null,
            });
          })
        }
      >
        <dl>
          <dt>Status</dt>
          <dd>
            <select name="status" defaultValue={task.status}>
              {STATUSES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </dd>
          <dt>Owner</dt>
          <dd>
            <select name="owner" defaultValue={task.owner ?? "nate"}>
              {OWNERS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>{" "}
            <span className="muted">
              <b className="k">o</b> cycles
            </span>
          </dd>
          <dt>Due</dt>
          <dd>
            <input type="date" name="due" defaultValue={task.due ?? ""} />
          </dd>
          <dt>Waiting on</dt>
          <dd>
            <input
              id="wk-waiting"
              name="waiting_on"
              defaultValue={task.waiting_on ?? ""}
              placeholder="nate, brandon, or what"
              list="wk-who"
            />{" "}
            <span className="muted">
              <b className="k">w</b>
            </span>
            <datalist id="wk-who">
              {OWNERS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </dd>
        </dl>
        <div className="sec">
          <h3>Description</h3>
          <textarea name="body" rows={4} defaultValue={task.body ?? ""} />
        </div>
        <div className="sec acts">
          <button className="btn pri" disabled={busy}>
            Save
          </button>
          {msg ? <span className="note">{msg}</span> : null}
        </div>
      </form>

      <div className="sec">
        <h3>Notes</h3>
        {notes.length ? (
          <ul className="hist">
            {notes.map((n) => (
              <li key={n.id}>
                {n.body} <span className="muted">· {n.created_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No notes yet.</p>
        )}
        <form
          className="acts"
          data-reset="1"
          key={`n${notes.length}`}
          onSubmit={(e) => submit(e, (f) => addNoteAction(task.id, s(f, "body")))}
        >
          <input name="body" placeholder="Add a note" aria-label="Note" required />
          <button className="btn sm" disabled={busy}>
            Add
          </button>
        </form>
      </div>

      <div className="sec">
        <h3>Links</h3>
        {links.length ? (
          <ul>
            {links.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label || l.url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No links yet.</p>
        )}
        <form
          className="acts"
          data-reset="1"
          key={`l${links.length}`}
          onSubmit={(e) => submit(e, (f) => addLinkAction(task.id, s(f, "label"), s(f, "url")))}
        >
          <input name="label" placeholder="Label" aria-label="Link label" />
          <input name="url" type="url" placeholder="https://…" aria-label="Link URL" required />
          <button className="btn sm" disabled={busy}>
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
