"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addListItemAction, cycleListItem } from "@/app/(app)/work/actions";
import { LISTS, nextListStatus, type ListName, type ListStatus } from "@/lib/tasks";

export interface ListItem {
  id: string;
  list: ListName;
  business: string;
  status: ListStatus;
  notes: string | null;
}

const TITLE: Record<ListName, string> = {
  warm: "Warm contacts",
  interviews: "Interviews",
  associations: "Associations",
};
const CHIP: Record<ListStatus, string> = {
  todo: "",
  reached: "warn",
  scheduled: "stage",
  done: "ok",
  no: "bad",
};

/** The Lists tab: warm / interviews / associations, status cycles on click (todo→reached→scheduled→done→no). */
export function WorkLists({ items }: { items: ListItem[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? null : (r.error ?? "failed"));
    });

  function add(e: FormEvent<HTMLFormElement>, list: ListName) {
    e.preventDefault();
    const form = e.currentTarget;
    const business = String(new FormData(form).get("business") ?? "");
    run(async () => {
      const r = await addListItemAction(list, business);
      if (r.ok) form.reset();
      return r;
    });
  }

  return (
    <>
      {msg ? (
        <p className="note err" role="alert">
          {msg}
        </p>
      ) : null}
      {LISTS.map((list) => {
        const rows = items.filter((i) => i.list === list);
        return (
          <section className="sx" key={list}>
            <div className="sh">
              <h2>{TITLE[list]}</h2>
              <span className="cnt">{rows.length}</span>
              <span className="sub">business names only</span>
            </div>
            <div className="card">
              {rows.length ? (
                rows.map((i) => (
                  <div
                    className={`row${i.status === "done" || i.status === "no" ? " done" : ""}`}
                    key={i.id}
                  >
                    <div className="rb">
                      <div className="r1">
                        <span className="rt">{i.business}</span>
                        <span className="rm">
                          <button
                            className={`chip own ${CHIP[i.status]}`}
                            disabled={busy}
                            title="Click to advance the status"
                            onClick={() => run(() => cycleListItem(i.id, nextListStatus(i.status)))}
                          >
                            {i.status}
                          </button>
                        </span>
                      </div>
                      {i.notes ? <div className="r2">{i.notes}</div> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">Nothing here yet.</div>
              )}
              <form className="acts addrow" onSubmit={(e) => add(e, list)}>
                <input
                  name="business"
                  placeholder="Add a business"
                  aria-label={`Add to ${TITLE[list]}`}
                  required
                />
                <button className="btn sm" disabled={busy}>
                  Add
                </button>
              </form>
            </div>
          </section>
        );
      })}
    </>
  );
}
