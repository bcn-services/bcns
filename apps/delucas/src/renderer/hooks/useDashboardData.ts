/**
 * useDashboardData — fetches MonthPnl, 12-month series, and transaction list
 * for the current month from the IPC bridge.
 *
 * Re-fetches whenever currentMonth changes. Exposes a refresh() callback so
 * callers can trigger a re-fetch after a mutation (edit/delete).
 *
 * No node:* or electron imports — renderer only.
 */

import { useCallback, useEffect, useState } from "react";
import type { MonthPnl, Transaction } from "../../shared/types";

export interface DashboardData {
  pnl: MonthPnl | null;
  series: MonthPnl[];
  transactions: Transaction[];
  summary: string;
  loading: boolean;
  error: string | null;
}

const EMPTY_PNL: MonthPnl = {
  month: "",
  revenue_cents: 0,
  expense_cents: 0,
  profit_cents: 0,
  expense_by_category: { food: 0, beverage: 0, utilities: 0, rent: 0, labor: 0, other: 0 },
};

export function useDashboardData(currentMonth: string): DashboardData & { refresh: () => void } {
  const [pnl, setPnl] = useState<MonthPnl | null>(null);
  const [series, setSeries] = useState<MonthPnl[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchAll(): Promise<void> {
      try {
        const [monthPnl, monthSeries, txs, monthSummary] = await Promise.all([
          window.bridge.db.getMonthPnl(currentMonth),
          window.bridge.db.get12MonthSeries(currentMonth),
          window.bridge.db.getTransactionsForMonth(currentMonth),
          window.bridge.db.getSummary(currentMonth),
        ]);

        if (!cancelled) {
          setPnl(monthPnl ?? { ...EMPTY_PNL, month: currentMonth });
          setSeries(monthSeries ?? []);
          setTransactions(txs ?? []);
          setSummary(monthSummary ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load dashboard data";
          setError(message);
          console.error("[useDashboardData] fetch failed", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAll();
    return () => { cancelled = true; };
  }, [currentMonth, tick]);

  return { pnl, series, transactions, summary, loading, error, refresh };
}
