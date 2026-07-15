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

export function ReviewQueue(): React.JSX.Element | null {
  const [items, setItems] = useState<ReviewItemBridge[]>([]);

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
    try {
      // Import the approved transaction
      const txWithEmail: NewTransaction = {
        ...tx,
        source: "email",
        source_ref: item.message_id,
      };
      await window.bridge.db.insertTransaction(txWithEmail);
    } catch (err) {
      console.error("[ReviewQueue] failed to insert transaction", err);
    }
    try {
      await window.bridge.ingestion.clearReviewItem(item.id);
    } catch (err) {
      console.error("[ReviewQueue] failed to clear review item", err);
    }
    await fetchQueue();
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
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Needs review ({items.length})
      </h2>
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
