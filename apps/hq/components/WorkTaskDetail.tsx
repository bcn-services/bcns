"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addLinkAction, addNoteAction, markDone, updateTaskAction } from "@/app/(app)/work/actions";
import { OWNERS, waitingStatus, type Owner, type Status, type Task } from "@/lib/tasks";
import type { Track } from "@/lib/tracks";
import type { ClientOpt } from "./NewTaskModal";

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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** An open task (replaces the board): fields, description, Done / Save, then notes and links. */
export function WorkTaskDetail(props: {
  task: WorkTask;
  notes: WorkNote[];
  links: WorkLink[];
  tracks: Track[];
  clients: ClientOpt[];
  onBack: () => void;
}) {
  const { task, notes, links, tracks, clients, onBack } = props;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const done = task.status === "done";

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
    <div className="wk-det">
      <div className="wk-hdr">
        <button type="button" className="btn" onClick={onBack}>
          ← Board
        </button>
      </div>
      <h1>{task.title}</h1>
      {task.lead || task.alert_key ? (
        <p className="sub2">
          {task.lead ? (
            <>
              Lead: <a href="/leads">{task.lead}</a>{" "}
            </>
          ) : null}
          {task.alert_key ? <span className="chip warn">alert {task.alert_key}</span> : null}
        </p>
      ) : null}

      <form
        key={`${task.id}${task.status}${task.owner}${task.due}${task.waiting_on}${task.body}${task.track_id}${task.client_slug}`}
        onSubmit={(e) =>
          submit(e, (f) => {
            const waiting = s(f, "waiting_on");
            // status follows waiting_on only when the waiting text itself changed
            const status =
              waiting.trim() !== (task.waiting_on ?? "").trim()
                ? (waitingStatus(waiting, task.status) ?? task.status)
                : task.status;
            return updateTaskAction(task.id, {
              status: status as Status,
              owner: (s(f, "owner") || null) as Owner | null,
              due: s(f, "due") || null,
              waiting_on: waiting || null,
              body: s(f, "body") || null,
              track_id: s(f, "track") || null,
              client_slug: s(f, "client") || null,
            });
          })
        }
      >
        <dl>
          <dt>Owner</dt>
          <dd>
            <select name="owner" aria-label="Owner" defaultValue={task.owner ?? ""}>
              <option value="">Unassigned</option>
              {OWNERS.map((x) => (
                <option key={x} value={x}>
                  {cap(x)}
                </option>
              ))}
            </select>
          </dd>
          <dt>Due</dt>
          <dd>
            <input type="date" name="due" aria-label="Due" defaultValue={task.due ?? ""} />
          </dd>
          <dt>Track</dt>
          <dd>
            <select name="track" aria-label="Track" defaultValue={task.track_id ?? ""}>
              <option value="">No track</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </dd>
          <dt>Client</dt>
          <dd>
            <select name="client" aria-label="Client" defaultValue={task.client_slug ?? ""}>
              <option value="">No client</option>
              {/* A slug with no clients row (no FK, or the clients query failed) stays selected, so Save cannot null it. */}
              {task.client_slug && !clients.some((c) => c.slug === task.client_slug) && (
                <option value={task.client_slug}>{task.client_slug}</option>
              )}
              {clients.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </dd>
          <dt>Waiting on</dt>
          <dd>
            <input
              id="wk-waiting"
              name="waiting_on"
              aria-label="Waiting on"
              defaultValue={task.waiting_on ?? ""}
              placeholder="who or what this waits on"
            />
          </dd>
        </dl>
        <textarea
          name="body"
          aria-label="Description"
          placeholder="Description"
          defaultValue={task.body ?? ""}
        />
        <div className="wk-acts">
          <button
            type="button"
            className="btn pri"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = done
                  ? await updateTaskAction(task.id, { status: "todo" })
                  : await markDone(task.id);
                if (!r.ok) setMsg(r.error);
                else if (!done) onBack();
              })
            }
          >
            {done ? "Reopen" : "✓ Done"}
          </button>
          <button className="btn" disabled={busy}>
            Save
          </button>
          {msg ? <span className="note">{msg}</span> : null}
        </div>
      </form>

      <div className="wk-sec">
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
          className="wk-acts"
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

      <div className="wk-sec">
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
          className="wk-acts"
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
