/**
 * ProfitBarChart — 12-month profit bar chart using simple custom SVG.
 * No recharts dependency — keeps bundle lean for a plain functional UI.
 *
 * Bars are green for profit, red for loss. Month labels shown on x-axis.
 * Renderer only — no node:* or electron imports.
 */

import React from "react";
import type { MonthPnl } from "../../shared/types";

interface ProfitBarChartProps {
  series: MonthPnl[];
}

const CHART_WIDTH = 600;
const CHART_HEIGHT = 160;
const BAR_GAP = 4;
const LABEL_HEIGHT = 20;
const TOP_PADDING = 8;
const BOTTOM_PADDING = LABEL_HEIGHT + 4;

function shortMonth(monthKey: string): string {
  const [, mon] = monthKey.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Number(mon) - 1] ?? mon;
}

export function ProfitBarChart({ series }: ProfitBarChartProps): React.JSX.Element {
  if (series.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4 text-center text-sm text-muted-foreground h-[180px] flex items-center justify-center">
        No data yet
      </div>
    );
  }

  const profits = series.map((m) => m.profit_cents);
  const maxAbs = Math.max(1, ...profits.map(Math.abs));
  const n = series.length;
  const drawHeight = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING;
  const barWidth = (CHART_WIDTH - BAR_GAP * (n + 1)) / n;
  // Zero line y-position: center of drawing area
  const zeroY = TOP_PADDING + drawHeight / 2;

  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        12-month profit
      </p>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        aria-label="12-month profit bar chart"
        role="img"
      >
        {/* Zero baseline */}
        <line
          x1={0}
          y1={zeroY}
          x2={CHART_WIDTH}
          y2={zeroY}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />

        {series.map((m, i) => {
          const x = BAR_GAP + i * (barWidth + BAR_GAP);
          const profit = m.profit_cents;
          const barH = (Math.abs(profit) / maxAbs) * (drawHeight / 2);
          const y = profit >= 0 ? zeroY - barH : zeroY;
          const fill = profit >= 0 ? "#16a34a" : "#dc2626"; // green-600 / red-600

          return (
            <g key={m.month}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(2, barH)}
                fill={fill}
                rx={2}
                data-month={m.month}
                data-profit-cents={profit}
              />
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                className="text-muted-foreground"
              >
                {shortMonth(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
