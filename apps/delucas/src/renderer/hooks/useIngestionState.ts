/**
 * useIngestionState — fetches last run report, email status, and review queue.
 *
 * No node:* or electron imports — renderer only.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  IngestionRunReportBridge,
  EmailStatusBridge,
  ReviewItemBridge,
} from "../../bridge/BridgeInterface";

export interface IngestionState {
  lastRunReport: IngestionRunReportBridge | null;
  emailStatus: EmailStatusBridge | null;
  reviewQueue: ReviewItemBridge[];
  loading: boolean;
}

export function useIngestionState(): IngestionState & { refresh: () => void } {
  const [lastRunReport, setLastRunReport] = useState<IngestionRunReportBridge | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusBridge | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewItemBridge[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll(): Promise<void> {
      try {
        const [report, status, queue] = await Promise.all([
          window.bridge.ingestion.getLastRunReport(),
          window.bridge.ingestion.getEmailStatus(),
          window.bridge.ingestion.getReviewQueue(),
        ]);

        if (!cancelled) {
          setLastRunReport(report);
          setEmailStatus(status);
          setReviewQueue(queue ?? []);
        }
      } catch (err) {
        console.error("[useIngestionState] fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAll();

    // Poll every 30s to pick up background ingestion results
    const id = setInterval(() => { void fetchAll(); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tick]);

  return { lastRunReport, emailStatus, reviewQueue, loading, refresh };
}
