"use client";

/**
 * MondayDoneButton.tsx — the ring on a Monday row. Submitting the surrounding
 * form queues the mark-done command; while it is in flight (and after, until a
 * later sync shows the item done) the row reads "Done" with a small dot.
 */

import { useFormStatus } from "react-dom";

export function MondayDoneButton({ title, pending: queued }: { title: string; pending: boolean }) {
  const { pending: submitting } = useFormStatus();
  const waiting = submitting || queued;
  return (
    <button
      className={`task-check${waiting ? " task-check--done" : ""}`}
      type="submit"
      disabled={waiting}
      aria-label={waiting ? `Marked done: ${title}` : `Mark done: ${title}`}
    />
  );
}
