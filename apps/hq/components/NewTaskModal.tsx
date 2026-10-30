"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createTaskAction, searchLeadsAction } from "@/app/(app)/work/actions";
import { assertOwners } from "@/lib/tasks";
import { OwnerChecks } from "./OwnerChecks";
import type { Track } from "@/lib/tracks";

export interface ClientOpt {
  slug: string;
  display_name: string;
}

/** "+ New task": Title, Description, owner, date, track, client. Esc or the scrim closes it. `lead` presets the task's business (from a lead's drawer). */
export function NewTaskModal(props: {
  tracks: Track[];
  clients: ClientOpt[];
  lead?: { id: string; name: string };
  onClose: () => void;
}) {
  const { tracks, clients, lead, onClose } = props;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // a task hangs off a lead or a client, never both: picking one hides the other's field. `lead` (preset) is fixed.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [client, setClient] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; town: string | null }[]>([]);
  const the = lead ?? picked;

  useEffect(() => {
    if (!q.trim()) return setHits([]);
    let live = true;
    const t = setTimeout(
      () => searchLeadsAction(q).then((r) => live && setHits(r), () => live && setHits([])),
      250
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    const track = tracks.find((t) => t.id === s("track"));
    start(async () => {
      const r = await createTaskAction({
        title: s("title"),
        body: s("body") || null,
        owners: assertOwners(f.getAll("owner")),
        due: s("due") || null,
        trackId: s("track") || null,
        clientSlug: the ? null : client || null,
        businessId: the?.id ?? null,
        area: track?.area ?? (lead ? "leads" : null), // a track's area carries to its steps; a lead's drawer task is a leads task
      });
      if (r.ok) onClose();
      else setMsg(r.error);
    });
  }

  return (
    <div className="wk-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="wk-modal"
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        onSubmit={submit}
      >
        <div className="wk-hdr">
          <h2>New task</h2>
          <button type="button" className="btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          name="title"
          className="wk-title-in"
          placeholder="Title"
          aria-label="Title"
          required
          autoFocus
        />
        <textarea name="body" placeholder="Description" aria-label="Description" />
        <div className="wk-g">
          <OwnerChecks />
          <input type="date" name="due" aria-label="Date" />
          <select name="track" aria-label="Track" defaultValue="">
            <option value="">No track</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {the ? null : (
            <select name="client" aria-label="Client" value={client} onChange={(e) => {
                setClient(e.target.value);
                setQ("");
              }}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
        {the ? (
          <p className="muted">
            Lead: {the.name}{" "}
            {lead ? null : (
              <button type="button" className="btn sm" onClick={() => setPicked(null)}>
                Clear
              </button>
            )}
          </p>
        ) : client ? null : (
          <div className="wk-pick">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault(); // Enter picks the first hit; it must not submit the task without the lead
                const h = hits[0];
                if (h && q.trim()) {
                  setPicked({ id: h.id, name: h.name });
                  setQ("");
                }
              }}
              placeholder="Lead (optional): search by business name"
              aria-label="Lead"
              autoComplete="off"
            />
            {q.trim() && hits.length ? (
              <ul>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked({ id: h.id, name: h.name });
                        setQ("");
                      }}
                    >
                      {h.name}
                      {h.town ? ` · ${h.town}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        {msg ? (
          <p className="note err" role="alert">
            {msg}
          </p>
        ) : null}
        <div className="wk-acts end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            Create task
          </button>
        </div>
      </form>
    </div>
  );
}
