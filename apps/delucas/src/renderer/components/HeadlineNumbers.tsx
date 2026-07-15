/**
 * HeadlineNumbers — displays Revenue / Expenses / Profit for a month.
 * Profit is green when positive, red when negative.
 * Shows the plain-English summary sentence from P2's generateSummary().
 *
 * Renderer only — no node:* or electron imports.
 */

import React from "react";
import type { MonthPnl } from "../../shared/types";

interface HeadlineNumbersProps {
  pnl: MonthPnl | null;
  summary: string;
  loading: boolean;
}

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remaining = abs % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  if (remaining === 0) return `$${dollarsStr}`;
  return `$${dollarsStr}.${remaining.toString().padStart(2, "0")}`;
}

interface StatCardProps {
  label: string;
  value: string;
  colorClass?: string;
}

function StatCard({ label, value, colorClass = "text-foreground" }: StatCardProps): React.JSX.Element {
  return (
    <div className="flex-1 border border-border rounded-lg p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}

export function HeadlineNumbers({ pnl, summary, loading }: HeadlineNumbersProps): React.JSX.Element {
  if (loading || pnl === null) {
    return (
      <div className="space-y-3">
        <div className="flex gap-4">
          {["Revenue", "Expenses", "Profit"].map((label) => (
            <div key={label} className="flex-1 border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <p className="text-3xl font-bold text-muted-foreground/40">—</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const profitColor =
    pnl.profit_cents > 0
      ? "text-green-600 dark:text-green-400"
      : pnl.profit_cents < 0
      ? "text-red-600 dark:text-red-400"
      : "text-foreground";

  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <StatCard label="Revenue" value={formatCents(pnl.revenue_cents)} />
        <StatCard label="Expenses" value={formatCents(pnl.expense_cents)} />
        <StatCard
          label="Profit"
          value={(pnl.profit_cents < 0 ? "-" : "") + formatCents(pnl.profit_cents)}
          colorClass={profitColor}
        />
      </div>
      {summary !== "" && (
        <p className="text-sm text-muted-foreground">{summary}</p>
      )}
    </div>
  );
}
