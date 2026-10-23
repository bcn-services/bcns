"use client";

/**
 * MondayRow.tsx — one row of the Monday panel. The form posts to the mark-done
 * action, or to the undo action when the row is already checked; a refused or
 * failed enqueue comes back as `{ error: true }` and shows the same quiet
 * "Couldn’t update" note as a command the worker marked failed.
 */

import { useFormState } from "react-dom";
import { markMondayDone, markMondayUndone, type MarkDoneState } from "@/app/monday-actions";
import type { CommandState } from "@/lib/monday";
import { MondayDoneButton } from "./MondayDoneButton";

export function MondayRow({
  itemId,
  title,
  cmd,
  checked,
  badge,
}: {
  itemId: string;
  title: string;
  cmd: CommandState | undefined;
  checked: boolean;
  badge: { label: string; tone: string };
}) {
  const [state, action] = useFormState<MarkDoneState, FormData>(checked ? markMondayUndone : markMondayDone, null);
  return (
    <form className="task-row" action={action}>
      <input type="hidden" name="item_id" value={itemId} />
      {itemId ? <MondayDoneButton title={title} checked={checked} /> : <span className="task-ring" aria-hidden="true" />}
      <span className="task-row__title">{title}</span>
      {cmd === "failed" || state?.error ? <span className="task-row__note">Couldn’t update</span> : null}
      {cmd === "pending" ? <span className="task-dot" role="img" aria-label="Updating Monday" /> : null}
      <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
    </form>
  );
}
