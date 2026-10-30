"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createTaskAction } from "@/app/(app)/work/actions";
import { assertOwners } from "@/lib/tasks";
import { OwnerChecks } from "./OwnerChecks";
import type { Track } from "@/lib/tracks";

export interface ClientOpt {
  slug: string;
  display_name: string;
}

/** "+ New task": Title, Description, owner, date, track, client. Esc or the scrim closes it. */
export function NewTaskModal(props: {
  tracks: Track[];
  clients: ClientOpt[];
  onClose: () => void;
}) {
  const { tracks, clients, onClose } = props;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

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
        clientSlug: s("client") || null,
        area: track?.area ?? null, // a track's area carries to its steps
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
          <select name="client" aria-label="Client" defaultValue="">
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
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
