"use client";

/**
 * MondayRow.tsx — one row of the Monday panel. The form posts to the mark-done
 * action; a refused or failed enqueue comes back as `{ error: true }` and shows
 * the same quiet "Couldn’t update" note as a command the worker marked failed.
 */

import { useFormState } from "react-dom";
import { markMondayDone, type MarkDoneState } from "@/app/monday-actions";
import type { CommandState } from "@/lib/monday";
import { MondayDoneButton } from "./MondayDoneButton";

export function MondayRow({
  itemId,
  title,
  cmd,
  badge,
}: {
  itemId: string;
  title: string;
  cmd: CommandState | undefined;
  badge: { label: string; tone: string };
}) {
  const [state, action] = useFormState<MarkDoneState, FormData>(markMondayDone, null);
  const done = cmd === "pending" || cmd === "done";
  const shown = done ? { label: "Done", tone: "done" } : badge;
  return (
    <form className="task-row" action={action}>
      <input type="hidden" name="item_id" value={itemId} />
      {itemId ? <MondayDoneButton title={title} pending={done} /> : <span className="task-ring" aria-hidden="true" />}
      <span className="task-row__title">{title}</span>
      {cmd === "failed" || state?.error ? <span className="task-row__note">Couldn’t update</span> : null}
      {cmd === "pending" ? <span className="task-dot" role="img" aria-label="Updating Monday" /> : null}
      <span className={`badge badge--${shown.tone}`}>{shown.label}</span>
    </form>
  );
}
