"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  addLinkAction,
  addNoteAction,
  deleteTaskAction,
  markDone,
  updateTaskAction,
} from "@/app/(app)/work/actions";
import { assertOwners, STATUSES, waitingStatus, type Status, type Task } from "@/lib/tasks";
import { OwnerChecks } from "./OwnerChecks";
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
  admin?: boolean;
  onBack: () => void;
}) {
  const { task, notes, links, tracks, clients, onBack } = props;
  const [msg, setMsg] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, start] = useTransition();
  const done = task.status === "done";
  const isTicket = !!task.alert_key?.startsWith("ticket:");
  // send resolution only when this form changed it: a stale open detail must not blank one set elsewhere (MCP)
  const resChanged = (v: string) => v.trim() !== (task.resolution ?? "");
  const [resText, setResText] = useState(task.resolution ?? ""); // enables Reply

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
        key={`${task.id}${task.status}${task.owners.join()}${task.due}${task.waiting_on}${task.body}${task.track_id}${task.client_slug}`}
        onSubmit={(e) =>
          submit(e, (f) => {
            const waiting = s(f, "waiting_on");
            const ticked = assertOwners(f.getAll("owner"));
            const picked = (s(f, "status") || task.status) as Status; // no select once done
            // a changed Status select wins (leaving waiting clears waiting_on, else the board keeps it in Waiting);
            // otherwise status follows waiting_on only when the waiting text itself changed
            const pickChanged = picked !== task.status;
            const status = pickChanged
              ? picked
              : waiting.trim() !== (task.waiting_on ?? "").trim()
                ? (waitingStatus(waiting, picked) ?? picked)
                : picked;
            return updateTaskAction(task.id, {
              status: status as Status,
              owners: [
                ...task.owners.filter((o) => ticked.includes(o)),
                ...ticked.filter((o) => !task.owners.includes(o)),
              ], // keep existing order: the first owner is the board group
              due: s(f, "due") || null,
              waiting_on: pickChanged && picked !== "waiting" ? null : waiting || null,
              body: s(f, "body") || null,
              ...(isTicket && resChanged(s(f, "resolution"))
                ? { resolution: s(f, "resolution") || null }
                : {}),
              track_id: s(f, "track") || null,
              client_slug: s(f, "client") || null,
            });
          })
        }
      >
        <dl>
          {done ? null : (
            <>
              {/* Done stays on its toggle below; doing puts the task in Now */}
              <dt>Status</dt>
              <dd>
                <select name="status" aria-label="Status" defaultValue={task.status}>
                  {STATUSES.filter((x) => x !== "done").map((x) => (
                    <option key={x} value={x}>
                      {cap(x)}
                    </option>
                  ))}
                </select>
              </dd>
            </>
          )}
          <dt>Owner</dt>
          <dd>
            <OwnerChecks defaultValue={task.owners} />
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
        {isTicket ? (
          <>
            <textarea
              key={task.resolution ?? ""}
              name="resolution"
              aria-label="Resolution"
              placeholder="Resolution"
              defaultValue={task.resolution ?? ""}
              onInput={(e) => setResText(e.currentTarget.value)}
              // saved on leaving the box so the d key (which sends no text) closes with it; not via `start`, which would disable Done mid-click
              onBlur={async (e) => {
                const v = e.currentTarget.value;
                if (!resChanged(v)) return;
                const r = await updateTaskAction(task.id, { resolution: v.trim() || null });
                if (!r.ok) setMsg(r.error);
              }}
            />
            <p className="muted">
              {done
                ? "Already sent if the ticket has synced; later edits are not pushed."
                : "Sent to the client's ticket when this task is done. Saved when you leave the box or press Done. Reply sends it now and keeps the ticket open."}
            </p>
            {task.reply && !done ? <p className="muted">Reply queued</p> : null}
          </>
        ) : null}
        <div className="wk-acts">
          <button
            type="button"
            className="btn pri"
            disabled={busy}
            onClick={(e) => {
              // a ticket's resolution goes in the same patch as done: the job pushes on done, so a later save is never sent
              const typed =
                isTicket && e.currentTarget.form
                  ? s(new FormData(e.currentTarget.form), "resolution")
                  : null;
              const res = typed !== null && resChanged(typed) ? typed : null;
              start(async () => {
                const r = done
                  ? await updateTaskAction(task.id, { status: "todo" })
                  : res === null
                    ? await markDone(task.id)
                    : await updateTaskAction(task.id, { status: "done", resolution: res || null });
                if (!r.ok) setMsg(r.error);
                else if (!done) onBack();
              });
            }}
          >
            {done ? "Reopen" : "✓ Done"}
          </button>
          {isTicket && !done ? (
            <button
              type="button"
              className="btn"
              disabled={busy || !resText.trim()}
              onClick={(e) => {
                // send what is on screen, not component state
                const text = e.currentTarget.form ? s(new FormData(e.currentTarget.form), "resolution").trim() : "";
                if (!text) return;
                start(async () => {
                  // clears resolution in the same patch: the blur just saved this text there, and Done must not close with an interim reply
                  const r = await updateTaskAction(task.id, { reply: text, resolution: null });
                  if (r.ok) setResText("");
                  setMsg(r.ok ? "Reply queued." : r.error);
                });
              }}
            >
              Reply
            </button>
          ) : null}
          <button className="btn" disabled={busy}>
            Save
          </button>
          {props.admin && !isTicket ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                if (!sure) return setSure(true);
                start(async () => {
                  const r = await deleteTaskAction(task.id);
                  setSure(false);
                  if (!r.ok) setMsg(r.error);
                  else onBack();
                });
              }}
              onBlur={() => setSure(false)}
            >
              {sure ? "Really delete?" : "Delete"}
            </button>
          ) : null}
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
