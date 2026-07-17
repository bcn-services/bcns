/**
 * ReviewQueue — renders pending low/medium-confidence email extractions as
 * ConfirmCards. Each card lets the user approve (import) or dismiss.
 *
 * Renderer only — no node:* or electron imports.
 */

"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { ReviewItemBridge } from "../../bridge/BridgeInterface";
import type { NewTransaction } from "../../shared/types";
import { ConfirmCard } from "./ConfirmCard";

interface ReviewQueueProps {
  /** Called after a review item is approved+saved so the parent can refresh the
   *  dashboard/transaction list to show the new transaction. */
  onSaved?: () => void;
}

export function ReviewQueue({ onSaved }: ReviewQueueProps = {}): React.JSX.Element | null {
  const [items, setItems] = useState<ReviewItemBridge[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async (): Promise<void> => {
    try {
      const queue = await window.bridge.ingestion.getReviewQueue();
      setItems(queue);
    } catch {
      // Bridge unavailable in browser dev mode
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    // Re-poll every 15 seconds to pick up new items from background ingestion
    const id = setInterval(() => { void fetchQueue(); }, 15_000);
    return () => clearInterval(id);
  }, [fetchQueue]);

  if (items.length === 0) return null;

  async function handleConfirm(item: ReviewItemBridge, tx: NewTransaction): Promise<void> {
    setError(null);
    // Import the approved transaction. Only clear the review item if the insert
    // actually succeeded — otherwise the item would vanish with nothing saved.
    let result: { ok: true; id: number } | { ok: false; error: string };
    try {
      result = await window.bridge.db.insertTransaction({
        ...tx,
        source: "email",
        source_ref: item.message_id,
      });
    } catch (err) {
      console.error("[ReviewQueue] failed to insert transaction", err);
      setError("Could not save this transaction. Please try again.");
      return;
    }
    if (!result.ok) {
      console.error("[ReviewQueue] insert rejected:", result.error);
      setError(result.error);
      return;
    }

    try {
      await window.bridge.ingestion.clearReviewItem(item.id);
    } catch (err) {
      console.error("[ReviewQueue] failed to clear review item", err);
    }
    await fetchQueue();
    onSaved?.();
  }

  async function handleReject(item: ReviewItemBridge): Promise<void> {
    try {
      await window.bridge.ingestion.clearReviewItem(item.id);
    } catch (err) {
      console.error("[ReviewQueue] failed to clear review item", err);
    }
    await fetchQueue();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        Needs review ({items.length})
      </h2>
      {error !== null && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {items.map((item) => (
        <ConfirmCard
          key={item.id}
          extracted={item.extraction}
          filePath={item.message_id}
          onConfirm={(tx) => { void handleConfirm(item, tx); }}
          onReject={() => { void handleReject(item); }}
        />
      ))}
    </div>
  );
}
