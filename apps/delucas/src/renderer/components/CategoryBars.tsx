/**
 * CategoryBars — horizontal bar chart of current-month expense breakdown by category.
 * Plain bars (no pie chart). Each bar shows category label, dollar amount, and
 * a proportional width bar.
 *
 * Renderer only — no node:* or electron imports.
 */

import React from "react";
import type { CategoryBreakdown } from "../../shared/types";

interface CategoryBarsProps {
  breakdown: CategoryBreakdown | null;
}

const CATEGORY_LABELS: Record<keyof CategoryBreakdown, string> = {
  food: "Food & Ingredients",
  beverage: "Beverages",
  utilities: "Utilities",
  rent: "Rent",
  labor: "Labor / Staff",
  other: "Other",
};

const CATEGORY_ORDER: (keyof CategoryBreakdown)[] = [
  "food",
  "beverage",
  "utilities",
  "rent",
  "labor",
  "other",
];

function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remaining = cents % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  if (remaining === 0) return `$${dollarsStr}`;
  return `$${dollarsStr}.${remaining.toString().padStart(2, "0")}`;
}

export function CategoryBars({ breakdown }: CategoryBarsProps): React.JSX.Element {
  if (breakdown === null) {
    return (
      <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
        Loading expense breakdown…
      </div>
    );
  }

  const maxCents = Math.max(1, ...CATEGORY_ORDER.map((k) => breakdown[k]));
  const total = CATEGORY_ORDER.reduce((sum, k) => sum + breakdown[k], 0);

  if (total === 0) {
    return (
      <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
        No expenses this month
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Expenses by category
      </p>
      {CATEGORY_ORDER.filter((k) => breakdown[k] > 0).map((key) => {
        const cents = breakdown[key];
        const widthPct = (cents / maxCents) * 100;
        return (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-foreground">{CATEGORY_LABELS[key]}</span>
              <span className="text-muted-foreground tabular-nums">{formatCents(cents)}</span>
            </div>
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded bg-primary"
                style={{ width: `${widthPct}%` }}
                data-category={key}
                data-cents={cents}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
