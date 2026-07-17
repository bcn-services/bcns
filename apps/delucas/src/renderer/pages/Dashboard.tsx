/**
 * Dashboard — main screen, monthly grain.
 *
 * Sections:
 *  1. BannerList — active failure banners (email error)
 *  2. MonthNav — prev/next month selector
 *  3. HeadlineNumbers — Revenue / Expenses / Profit + summary sentence
 *  4. ProfitBarChart — 12-month profit bars
 *  5. CategoryBars — current-month expense breakdown
 *  6. IngestionStrip — "Since you last opened" import summary
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useCallback, useEffect, useState } from "react";
import { MonthNav } from "../components/MonthNav";
import { HeadlineNumbers } from "../components/HeadlineNumbers";
import { ProfitBarChart } from "../components/ProfitBarChart";
import { CategoryBars } from "../components/CategoryBars";
import { IngestionStrip } from "../components/IngestionStrip";
import { BannerList } from "../components/BannerList";
import { CheckNowButton } from "../components/CheckNowButton";
import { useDashboardData } from "../hooks/useDashboardData";
import { useIngestionState } from "../hooks/useIngestionState";

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

interface DashboardProps {
  /** Switch to the Add & fix tab — used by the "needs review" notification. */
  onGoToReview?: () => void;
}

export function Dashboard({ onGoToReview }: DashboardProps = {}): React.JSX.Element {
  const [currentMonth, setCurrentMonth] = useState(todayMonth);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const { pnl, series, transactions: _txs, summary, loading, refresh } = useDashboardData(currentMonth);
  const { emailStatus, reviewQueue, refresh: refreshIngestion } = useIngestionState();
  const reviewCount = reviewQueue.length;

  useEffect(() => {
    window.bridge.backup.getStatus().then((s) => {
      setBackupError(s.error);
      setLastBackup(s.lastBackup);
    }).catch(() => { /* ignore — backup status is non-critical */ });
  }, []);

  const handlePrev = useCallback(() => setCurrentMonth((m) => prevMonth(m)), []);
  const handleNext = useCallback(() => setCurrentMonth((m) => nextMonth(m)), []);

  return (
    <div className="space-y-5">
      {/* Check for new invoices (email poll + other sources) */}
      <div className="flex justify-end">
        <CheckNowButton onComplete={() => { refresh(); refreshIngestion(); }} />
      </div>

      {/* Needs-review notification — links to the review queue in Add & fix */}
      {reviewCount > 0 && (
        <button
          type="button"
          onClick={onGoToReview}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-left hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm font-medium text-amber-800 dark:text-amber-200">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m0 3.75h.008M11.25 4.5l-8.4 14.55A1.5 1.5 0 004.15 21.3h15.7a1.5 1.5 0 001.3-2.25L12.75 4.5a1.5 1.5 0 00-1.5-.75 1.5 1.5 0 00-1.5.75z" />
            </svg>
            {reviewCount} invoice{reviewCount === 1 ? "" : "s"} need{reviewCount === 1 ? "s" : ""} your review
          </span>
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-200 shrink-0">
            Review now →
          </span>
        </button>
      )}

      {/* Active failure banners (email + backup) */}
      <BannerList emailStatus={emailStatus} backupError={backupError} />

      {/* Month navigation */}
      <MonthNav currentMonth={currentMonth} onPrev={handlePrev} onNext={handleNext} />

      {/* Headline P&L numbers */}
      <HeadlineNumbers pnl={pnl} summary={summary} loading={loading} transactionCount={_txs.length} />

      {/* 12-month profit bar chart */}
      <ProfitBarChart series={series} />

      {/* Expense breakdown by category */}
      <CategoryBars breakdown={pnl?.expense_by_category ?? null} />

      {/* Since last opened strip */}
      <IngestionStrip />

      {/* Subtle last-backup date */}
      {lastBackup !== null && (
        <p className="text-xs text-muted-foreground/60 text-right">
          Last backup: {lastBackup}
        </p>
      )}

      {/* Hidden refresh trigger — used by AddFix tab after mutations */}
      <button
        id="dashboard-refresh-trigger"
        type="button"
        className="sr-only"
        onClick={refresh}
        aria-hidden="true"
        tabIndex={-1}
      >
        Refresh
      </button>
    </div>
  );
}
