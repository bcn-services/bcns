"use client";

/**
 * MondayDoneButton.tsx — the ring on a Monday row. Submitting the surrounding
 * form queues mark-done (or undo, when checked); while it is in flight the ring
 * already shows the new state, and it stays clickable once the command lands.
 */

import { useFormStatus } from "react-dom";

export function MondayDoneButton({ title, checked }: { title: string; checked: boolean }) {
  const { pending: submitting } = useFormStatus();
  const shown = submitting ? !checked : checked;
  return (
    <button
      className={`task-check${shown ? " task-check--done" : ""}`}
      type="submit"
      disabled={submitting}
      aria-label={checked ? `Undo done: ${title}` : `Mark done: ${title}`}
    />
  );
}
