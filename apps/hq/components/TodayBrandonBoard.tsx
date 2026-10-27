"use client";

import { useState, useTransition, type ReactNode } from "react";
import { logOutcome, reassign } from "@/app/(app)/leads/actions";
import { Board, type Row, type Section } from "./Board";

/**
 * Board + Brandon's keys for lead rows (Today and the Leads grid share it): 1/2/4 log straight away,
 * 3 asks for the consult time first, n focuses the note box, a flips the owner. Errors from the
 * actions show in a bar above the key hints; the page re-renders itself after each action.
 */
export function LeadBoard(props: {
  head: ReactNode;
  sections: Section[];
  details: Record<string, ReactNode>;
  idle?: ReactNode;
  emptyText?: string;
}) {
  const [consult, setConsult] = useState<Row | null>(null);
  const [local, setLocal] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  // the note box belongs to the open lead: only use its text for that lead's outcome
  function noteFor(row: Row): string {
    const t = document.getElementById("note");
    const id = t?.closest("form")?.querySelector<HTMLInputElement>("input[name=id]")?.value;
    return t instanceof HTMLTextAreaElement && id === row.key ? t.value : "";
  }

  function log(row: Row, n: number, consultLocal?: string) {
    const note = noteFor(row);
    start(async () => {
      const r = await logOutcome(row.key, n, { consultLocal, note });
      setMsg(r.ok ? "" : r.error);
      if (r.ok) setConsult(null);
    });
  }

  return (
    <Board
      {...props}
      onOutcome={(n, row) => {
        if (!row.canLog || pending) return;
        if (n === 3) {
          setConsult(row);
          setLocal("");
        } else log(row, n);
      }}
      onKey={(key, row) => {
        if (key === "n" && row.canLog !== undefined) {
          const t = document.getElementById("note");
          if (!t) return false;
          t.focus();
          return true;
        }
        if (key === "a" && row.assigned) {
          const to = row.assigned === "brandon" ? "nate" : "brandon";
          start(async () => {
            const r = await reassign(row.key, to);
            setMsg(r.ok ? "" : r.error);
          });
          return true;
        }
        return false;
      }}
      hints={
        <>
          <span>
            <b className="k">n</b> note
          </span>
          <span>
            <b className="k">a</b> reassign
          </span>
        </>
      }
      bar={
        <>
          {msg ? (
            <div className="barmsg" role="alert">
              {msg}
            </div>
          ) : null}
          {consult ? (
            <form
              className="consultbar"
              onSubmit={(e) => {
                e.preventDefault();
                if (local) log(consult, 3, local);
              }}
            >
              <span>
                Consult with <b>{consult.title}</b> (New York time)
              </span>
              <input
                type="datetime-local"
                required
                autoFocus
                value={local}
                aria-label="Consult date and time"
                onChange={(e) => setLocal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setConsult(null);
                }}
              />
              <button className="btn pri" type="submit" disabled={pending}>
                Book
              </button>
              <button className="btn" type="button" onClick={() => setConsult(null)}>
                Cancel
              </button>
            </form>
          ) : null}
        </>
      }
    />
  );
}
