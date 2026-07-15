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

export function Dashboard(): React.JSX.Element {
  const [currentMonth, setCurrentMonth] = useState(todayMonth);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const { pnl, series, transactions: _txs, summary, loading, refresh } = useDashboardData(currentMonth);
  const { emailStatus } = useIngestionState();

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
