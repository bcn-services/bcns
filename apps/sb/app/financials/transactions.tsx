"use client";

/**
 * The one client component for the two QuickBooks panels on /financials:
 * Quarterly Budget (sector cards + inline budget form) and Recent
 * Transactions (drag-and-drop + a per-row popup menu + a bulk-assign bar).
 *
 * Every mutation still goes through a real <form action={serverAction}> —
 * that is the accessible / no-JS path (a form field, a details/summary menu,
 * a checkbox). Drag-and-drop is the one interaction with no native form
 * equivalent, so its drop handler builds a FormData and calls the same
 * server action directly via useTransition, rather than duplicating the
 * validation that already lives in lib/financials.ts.
 */

import { useState, useTransition } from "react";
import { formatDayLabel, formatMoney } from "@/lib/overview";
import { Panel, PanelHead } from "@/app/_components/Panel";
import { FinanceIcon, DragHandleIcon } from "@/app/_components/icons";
import type { SectorTotal } from "@/lib/financials";
import { assignTransaction, bulkAssign, setSectorBudget, unassignTransaction } from "./actions";

const DROP_HINT_ID = "qb-sector-drop-hint";

export interface TxnRowData {
  externalId: string;
  date: string;
  vendor: string;
  memo: string | null;
  amountCents: number;
  sector: string | null;
}

// ponytail: recomputes fixed-position coords from getBoundingClientRect() on
// open so the popup escapes .table-scroll's overflow clipping without a
// portal; doesn't reposition on scroll/resize while open, only on toggle.
function positionMenu(e: React.SyntheticEvent<HTMLDetailsElement>) {
  const details = e.currentTarget;
  if (!details.open) return;
  const panel = details.querySelector<HTMLElement>(".popup-panel");
  if (!panel) return;
  const rect = details.getBoundingClientRect();
  panel.style.position = "fixed";
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.right = `${window.innerWidth - rect.right}px`;
  panel.style.left = "auto";
}

export function QuarterlyBudgetPanel({
  quarter,
  sectors,
  totalBudgetCents,
  totalSpentCents,
  totalRemainingCents,
  currency,
  range,
}: {
  quarter: string;
  sectors: SectorTotal[];
  totalBudgetCents: number;
  totalSpentCents: number;
  totalRemainingCents: number;
  currency: string;
  range: { from: string; to: string };
}) {
  const [dragOverSector, setDragOverSector] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function assignByDrop(txn: string, sector: string) {
    const fd = new FormData();
    fd.set("txn", txn);
    fd.set("sector", sector);
    fd.set("from", range.from);
    fd.set("to", range.to);
    startTransition(() => {
      void assignTransaction(fd);
    });
  }

  return (
    <Panel className="panel--column">
      <PanelHead tile={<FinanceIcon />} title="Quarterly Budget" right={<span className="badge badge--idle">This quarter · {quarter}</span>} />

      <div className="budget-summary">
        <div className="budget-summary__stat">
          <div className="budget-summary__value">{formatMoney(totalBudgetCents, currency)}</div>
          <div className="budget-summary__label">Total budget</div>
        </div>
        <div className="budget-summary__stat">
          <div className="budget-summary__value">{formatMoney(totalSpentCents, currency)}</div>
          <div className="budget-summary__label">Spent</div>
        </div>
        <div className="budget-summary__stat">
          <div className="budget-summary__value">{formatMoney(totalRemainingCents, currency)}</div>
          <div className="budget-summary__label">Remaining</div>
        </div>
      </div>

      <div className="sector-grid">
        {sectors.map((s) => (
          <div
            key={s.id}
            className={`sector-card${dragOverSector === s.id ? " is-dragover" : ""}`}
            aria-describedby={DROP_HINT_ID}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverSector(s.id);
            }}
            onDragLeave={() => setDragOverSector((cur) => (cur === s.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSector(null);
              const txn = e.dataTransfer.getData("text/plain");
              if (txn) assignByDrop(txn, s.id);
            }}
          >
            <div className="sector-card__title">{s.label}</div>
            <div className="sector-card__subtitle">{s.id}</div>
            <div className="sector-card__row">
              <span>Budget</span>
              <strong>{formatMoney(s.budgetCents, currency)}</strong>
            </div>
            <div className="sector-card__row">
              <span>Spent</span>
              <strong>{formatMoney(s.spentCents, currency)}</strong>
            </div>
            <div className="sector-card__row">
              <span>Remaining</span>
              <strong>{formatMoney(s.remainingCents, currency)}</strong>
            </div>
            <div
              className="budget-progress"
              role="progressbar"
              aria-valuenow={Math.round(Math.min(100, Math.max(0, s.pctUsed)))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${s.label} budget used`}
            >
              <div className="budget-progress__fill" style={{ width: `${Math.min(100, Math.max(0, s.pctUsed))}%` }} />
            </div>
            <div className="sector-card__pct">{Math.round(s.pctUsed)}% used</div>

            <form className="sector-card__budget-form" action={setSectorBudget}>
              <input type="hidden" name="quarter" value={quarter} />
              <input type="hidden" name="sector" value={s.id} />
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
              <input
                className="field__input"
                type="number"
                name="budget"
                step="0.01"
                min="0.01"
                defaultValue={s.budgetCents > 0 ? (s.budgetCents / 100).toFixed(2) : ""}
                placeholder="0.00"
                aria-label={`${s.label} budget`}
              />
              <button className="btn-accent btn-accent--sm" type="submit">
                Save
              </button>
            </form>
          </div>
        ))}
      </div>
      <p className="state-note" id={DROP_HINT_ID}>
        Drag a transaction from Recent Transactions onto a sector to assign it, or use that transaction&rsquo;s Actions menu
        &mdash; the keyboard-accessible way to assign it.
      </p>
    </Panel>
  );
}

export function RecentTransactionsPanel({
  connected,
  lastSyncedLabel,
  txns,
  sectors,
  currency,
  range,
}: {
  connected: boolean;
  lastSyncedLabel: string | null;
  txns: TxnRowData[];
  sectors: SectorTotal[];
  currency: string;
  range: { from: string; to: string };
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sectorLabelFor = (id: string | null) => (id ? (sectors.find((s) => s.id === id)?.label ?? id) : null);

  return (
    <Panel className="panel--column">
      <PanelHead
        tile={<FinanceIcon />}
        title="Recent Transactions"
        right={
          connected ? (
            <span className="txn-panel__sync">
              <span className="badge badge--ok">QuickBooks Connected</span>
              {lastSyncedLabel ? <span className="integration-row__meta">Last synced {lastSyncedLabel}</span> : null}
            </span>
          ) : null
        }
      />

      {!connected ? (
        <p className="state-note">Connect QuickBooks to see transactions.</p>
      ) : txns.length === 0 ? (
        <p className="state-note">No transactions synced yet.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="fin-table txn-table">
              <thead>
                <tr>
                  <th scope="col" aria-label="Select" />
                  <th scope="col" aria-label="Drag handle" />
                  <th scope="col">Date</th>
                  <th scope="col">Description / Merchant</th>
                  <th scope="col" className="fin-table__num">
                    Amount
                  </th>
                  <th scope="col">Current Sector</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr
                    key={t.externalId}
                    className={`txn-row${draggingId === t.externalId ? " is-dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.externalId);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(t.externalId);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <td>
                      <input type="checkbox" checked={checked.has(t.externalId)} onChange={() => toggleChecked(t.externalId)} aria-label={`Select ${t.vendor}`} />
                    </td>
                    <td className="drag-handle" aria-hidden="true">
                      <DragHandleIcon />
                    </td>
                    <td>{formatDayLabel(t.date)}</td>
                    <td>
                      <div className="txn-row__vendor">{t.vendor}</div>
                      {t.memo ? <div className="txn-row__memo">{t.memo}</div> : null}
                    </td>
                    <td className="fin-table__num">{formatMoney(t.amountCents, currency)}</td>
                    <td>
                      <span className={`badge ${t.sector ? "badge--sector" : "badge--idle"}`}>{sectorLabelFor(t.sector) ?? "Unassigned"}</span>
                    </td>
                    <td>
                      <details className="popup lib-menu" onToggle={positionMenu}>
                        <summary className="icon-btn" aria-label={`Actions for ${t.vendor}`}>
                          &hellip;
                        </summary>
                        <div className="popup-panel">
                          <div className="popup-panel__title">Assign to sector</div>
                          {sectors.map((s) => (
                            <form key={s.id} action={assignTransaction}>
                              <input type="hidden" name="txn" value={t.externalId} />
                              <input type="hidden" name="sector" value={s.id} />
                              <input type="hidden" name="from" value={range.from} />
                              <input type="hidden" name="to" value={range.to} />
                              <button className="popup-menu-item" type="submit">
                                {s.label}
                              </button>
                            </form>
                          ))}
                          <form action={unassignTransaction}>
                            <input type="hidden" name="txn" value={t.externalId} />
                            <input type="hidden" name="from" value={range.from} />
                            <input type="hidden" name="to" value={range.to} />
                            <button className="popup-menu-item popup-menu-item--muted" type="submit">
                              Unassign
                            </button>
                          </form>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {checked.size > 0 ? (
            <form className="bulk-bar" action={bulkAssign}>
              {[...checked].map((id) => (
                <input key={id} type="hidden" name="txns" value={id} />
              ))}
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
              <span className="bulk-bar__label">{checked.size} selected</span>
              <select className="lib-input lib-input--select lib-input--sm" name="sector" defaultValue="" aria-label="Sector to assign">
                <option value="">Assign to&hellip;</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button className="btn-plain btn-plain--inline" type="submit">
                Assign
              </button>
            </form>
          ) : null}
        </>
      )}
    </Panel>
  );
}
