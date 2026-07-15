/**
 * HeadlineNumbers — displays Revenue / Expenses / Profit for a month.
 * Profit is green when positive, red when negative.
 * Shows the plain-English summary sentence from P2's generateSummary().
 *
 * When all values are zero AND transactionCount is 0, shows EmptyState
 * instead of three zero cards (first-run / empty DB experience).
 *
 * Renderer only — no node:* or electron imports.
 */

import React from "react";
import type { MonthPnl } from "../../shared/types";
import { EmptyState } from "./EmptyState";

interface HeadlineNumbersProps {
  pnl: MonthPnl | null;
  summary: string;
  loading: boolean;
  /** Total transactions for the current month — used to detect first-run empty state. */
  transactionCount: number;
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
  /** When true, this card is visually dominant — larger type, accent-tinted background */
  dominant?: boolean;
  colorClass?: string;
}

function StatCard({ label, value, dominant = false, colorClass }: StatCardProps): React.JSX.Element {
  if (dominant) {
    return (
      <div className="flex-1 rounded-xl bg-card border border-border shadow-sm px-6 py-5 flex flex-col gap-1 ring-1 ring-border/60">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className={`text-5xl font-extrabold tabular-nums leading-none mt-1 ${colorClass ?? "text-foreground"}`}>
          {value}
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 rounded-xl bg-card border border-border shadow-sm px-5 py-4 flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className={`text-4xl font-bold tabular-nums leading-none mt-1 ${colorClass ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

export function HeadlineNumbers({ pnl, summary, loading, transactionCount }: HeadlineNumbersProps): React.JSX.Element {
  if (loading || pnl === null) {
    return (
      <div className="flex gap-3">
        {["Money in", "Spent", "Profit"].map((label) => (
          <div key={label} className="flex-1 rounded-xl bg-card border border-border shadow-sm px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
            <p className="text-4xl font-bold text-muted-foreground/30 mt-1">—</p>
          </div>
        ))}
      </div>
    );
  }

  // Empty-state: no transactions and all values are zero — show friendly prompt
  const isEmpty =
    transactionCount === 0 &&
    pnl.revenue_cents === 0 &&
    pnl.expense_cents === 0 &&
    pnl.profit_cents === 0;

  if (isEmpty) {
    return <EmptyState />;
  }

  const profitColor =
    pnl.profit_cents > 0
      ? "text-green-700"
      : pnl.profit_cents < 0
      ? "text-red-700"
      : "text-foreground";

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* Money in — left */}
        <StatCard label="Money in" value={formatCents(pnl.revenue_cents)} />
        {/* Spent — center */}
        <StatCard label="Spent" value={formatCents(pnl.expense_cents)} />
        {/* Profit — dominant, right — the number that matters most */}
        <StatCard
          label="Profit"
          value={(pnl.profit_cents < 0 ? "−" : "") + formatCents(pnl.profit_cents)}
          colorClass={profitColor}
          dominant
        />
      </div>
      {summary !== "" && (
        <p className="text-sm text-muted-foreground">{summary}</p>
      )}
    </div>
  );
}
