/**
 * MonthNav — prev/next month navigation bar.
 * Renderer only — no node:* or electron imports.
 */

import React from "react";

interface MonthNavProps {
  currentMonth: string; // "YYYY-MM"
  onPrev: () => void;
  onNext: () => void;
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-");
  const date = new Date(Number(year), Number(mon) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function MonthNav({ currentMonth, onPrev, onNext }: MonthNavProps): React.JSX.Element {
  // Disable next if we're at current month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  const isCurrentMonth = currentMonth >= thisMonth;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onPrev}
        className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors shadow-sm"
        aria-label="Previous month"
      >
        ← Prev
      </button>
      <span className="text-lg font-bold text-foreground min-w-[176px] text-center">
        {formatMonthLabel(currentMonth)}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={isCurrentMonth}
        className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        Next →
      </button>
    </div>
  );
}
