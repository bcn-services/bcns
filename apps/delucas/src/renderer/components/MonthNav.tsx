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
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onPrev}
        className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        aria-label="Previous month"
      >
        ← Prev
      </button>
      <span className="text-base font-semibold text-foreground min-w-[160px] text-center">
        {formatMonthLabel(currentMonth)}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={isCurrentMonth}
        className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        Next →
      </button>
    </div>
  );
}
