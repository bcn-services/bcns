"use client";

import { useState, useTransition } from "react";
import { decideProposal } from "@/app/(app)/work/actions";
import type { ProposalView } from "@/lib/proposals";

/** Approve / reject through the decide_proposal RPC; `msg` says what came back ('stale' shows as stale). */
export function useDecide() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  function decide(p: ProposalView, approve: boolean) {
    if (busy) return;
    start(async () => {
      const r = await decideProposal(p.id, approve);
      setMsg(
        `${p.target} · ${p.field}: ${r === "stale" ? "stale — it changed since this was proposed, nothing applied" : r}`
      );
    });
  }
  return { msg, busy, decide };
}

/** Before -> after table of pending proposals; the selected row is highlighted. */
export function ProposalTable({
  proposals,
  sel,
  onSelect,
}: {
  proposals: ProposalView[];
  sel: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <table className="diff prop">
      <thead>
        <tr>
          <th>Kind</th>
          <th>Target</th>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
          <th>Reason</th>
          <th>Who · age</th>
        </tr>
      </thead>
      <tbody>
        {proposals.map((p) => {
          const key = `p:${p.id}`;
          return (
            <tr
              key={p.id}
              className={key === sel ? "f" : undefined}
              aria-current={key === sel ? "true" : undefined}
              onClick={() => onSelect(key)}
            >
              <td>{p.kind}</td>
              <td>{p.target}</td>
              <td>{p.field}</td>
              <td className="b">{p.old}</td>
              <td className="a">{p.next}</td>
              <td>{p.reason}</td>
              <td className="muted">
                {p.who}
                {p.via ? ` (${p.via})` : ""} · {p.age}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ProposalDetail({
  p,
  busy,
  onDecide,
}: {
  p: ProposalView;
  busy: boolean;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <div className="dwrap">
      <div className="chips">
        <span className="chip stage">{p.kind}</span>
        <span className="chip warn">Awaiting approval</span>
      </div>
      <h1>{p.target}</h1>
      <p className="sub2">
        Proposed by {p.who}
        {p.via ? ` (via ${p.via})` : ""} · {p.age} ago
      </p>
      <div className="sec">
        <h3>Before → after</h3>
        <table className="diff">
          <thead>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{p.field}</td>
              <td className="b">{p.old}</td>
              <td className="a">{p.next}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {p.reason ? (
        <div className="sec">
          <h3>Reason</h3>
          <p>{p.reason}</p>
        </div>
      ) : null}
      {p.canDecide ? (
        <div className="sec acts">
          <button className="btn pri" disabled={busy} onClick={() => onDecide(true)}>
            Approve <b className="k">a</b>
          </button>
          <button className="btn neg" disabled={busy} onClick={() => onDecide(false)}>
            Reject <b className="k">r</b>
          </button>
        </div>
      ) : null}
      <p className="fine">
        {p.canDecide
          ? "Only a human click applies a change."
          : "Only an admin can approve or reject."}
      </p>
    </div>
  );
}
