"use client";

/**
 * IngestionStrip — "Since you last opened" summary strip.
 *
 * Shows the last ingestion run report: how many transactions were found,
 * imported, and failed. Used by the P5 dashboard as a status indicator.
 *
 * Fetches `ingestion:getLastRunReport` on mount. If no run has happened yet,
 * renders nothing.
 */

import React, { useEffect, useState } from "react";
import type { IngestionRunReportBridge } from "../../bridge/BridgeInterface";

export function IngestionStrip(): React.JSX.Element | null {
  const [report, setReport] = useState<IngestionRunReportBridge | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.bridge.ingestion
      .getLastRunReport()
      .then((r) => {
        setReport(r);
      })
      .catch((err) => {
        console.warn("[IngestionStrip] failed to load last run report", err);
      })
      .finally(() => {
        setLoaded(true);
      });
  }, []);

  // Don't flash on first render
  if (!loaded || report === null) return null;

  const formattedTime = new Date(report.ran_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-4 rounded-lg bg-muted/60 border border-border px-4 py-2.5 text-sm text-muted-foreground"
    >
      <span className="font-medium text-foreground">Since last sync ({formattedTime}):</span>

      <span className="flex items-center gap-1">
        <span className="text-blue-600 dark:text-blue-400 font-semibold">{report.found}</span>
        {" found"}
      </span>

      <span className="text-border" aria-hidden="true">·</span>

      <span className="flex items-center gap-1">
        <span className="text-green-600 dark:text-green-400 font-semibold">{report.imported}</span>
        {" imported"}
      </span>

      {report.failed > 0 && (
        <>
          <span className="text-border" aria-hidden="true">·</span>
          <span className="flex items-center gap-1">
            <span className="text-red-600 dark:text-red-400 font-semibold">{report.failed}</span>
            {" failed"}
          </span>
        </>
      )}
    </div>
  );
}
