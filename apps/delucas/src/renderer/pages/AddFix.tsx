/**
 * AddFix — "Add & fix" tab.
 *
 * Sections:
 *  1. ManualEntryForm — enter a transaction by hand
 *  2. DragDropZone + ConfirmCard — PDF import flow
 *  3. ReviewQueue — low/medium-confidence email extractions awaiting review
 *  4. TransactionList — current-month transactions with edit/delete
 *  5. RentRuleEditor — view/edit recurring rules
 *
 * Month navigation (prev/next) controls which month TransactionList shows.
 * After a mutation in TransactionList, the Dashboard is signaled to refresh
 * headline numbers (via a shared currentMonth + refresh callback from parent).
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useCallback, useState } from "react";
import { ManualEntryForm } from "../components/ManualEntryForm";
import { DragDropZone } from "../components/DragDropZone";
import { ReviewQueue } from "../components/ReviewQueue";
import { TransactionList } from "../components/TransactionList";
import { RentRuleEditor } from "../components/RentRuleEditor";
import { MonthNav } from "../components/MonthNav";
import { useDashboardData } from "../hooks/useDashboardData";
import type { IngestionRunReportBridge } from "../../bridge/BridgeInterface";

function todayMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const pm = m - 1;
  if (pm === 0) return `${y - 1}-12`;
  return `${y}-${pm.toString().padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const nm = m + 1;
  if (nm === 13) return `${y + 1}-01`;
  return `${y}-${nm.toString().padStart(2, "0")}`;
}

export function AddFix(): React.JSX.Element {
  const [currentMonth, setCurrentMonth] = useState(todayMonth);
  const [showManualForm, setShowManualForm] = useState(false);
  const [lastReport, setLastReport] = useState<IngestionRunReportBridge | null>(null);

  const { transactions, refresh } = useDashboardData(currentMonth);

  const handlePrev = useCallback(() => setCurrentMonth((m) => prevMonth(m)), []);
  const handleNext = useCallback(() => setCurrentMonth((m) => nextMonth(m)), []);

  function handleManualSuccess(report: IngestionRunReportBridge): void {
    setLastReport(report);
    setShowManualForm(false);
    refresh();
  }

  return (
    <div className="space-y-8">

      {/* Manual entry */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Enter manually
          </h2>
          {!showManualForm && (
            <button
              type="button"
              onClick={() => setShowManualForm(true)}
              className="text-xs text-primary hover:underline"
            >
              + Add transaction
            </button>
          )}
        </div>

        {showManualForm ? (
          <ManualEntryForm
            onSuccess={handleManualSuccess}
            onCancel={() => setShowManualForm(false)}
          />
        ) : lastReport !== null ? (
          <p className="text-sm text-green-600 dark:text-green-400">
            Saved {lastReport.imported} transaction{lastReport.imported !== 1 ? "s" : ""}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No transactions added yet this session.
          </p>
        )}
      </section>

      {/* PDF drag-and-drop */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Import from PDF
        </h2>
        <DragDropZone onImported={() => refresh()} />
      </section>

      {/* Email review queue */}
      <section>
        <ReviewQueue />
      </section>

      {/* Transaction list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Transactions
          </h2>
          <MonthNav currentMonth={currentMonth} onPrev={handlePrev} onNext={handleNext} />
        </div>
        <TransactionList transactions={transactions} onMutated={refresh} />
      </section>

      {/* Recurring rules */}
      <section>
        <RentRuleEditor />
      </section>

    </div>
  );
}
