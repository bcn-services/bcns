/**
 * review-queue.ts — In-memory queue for low/medium-confidence email extractions.
 *
 * When the LLM classifies an email as an invoice but with medium or low
 * confidence, the item is placed here instead of being auto-imported.
 * The renderer polls this queue and shows each item as a ConfirmCard.
 * Resolving an item (confirm or dismiss) removes it from the queue.
 *
 * Main process only (module-level singleton).
 */

import type { LLMExtractResult } from "./llm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewItem {
  /** Stable ID for IPC operations */
  id: string;
  /** ISO 8601 timestamp when this item was queued */
  queued_at: string;
  /** The message-id of the source email */
  message_id: string;
  /** Raw LLM result (is_invoice: true, confidence medium/low) */
  extraction: LLMExtractResult;
}

// ---------------------------------------------------------------------------
// Module-level queue (singleton in main process)
// ---------------------------------------------------------------------------

const queue: ReviewItem[] = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a low/medium-confidence extraction to the review queue.
 * Returns the assigned item ID.
 */
export function enqueueReviewItem(messageId: string, extraction: LLMExtractResult): string {
  const id = `review-${nextId++}`;
  queue.push({
    id,
    queued_at: new Date().toISOString(),
    message_id: messageId,
    extraction,
  });
  return id;
}

/**
 * Return a snapshot of all pending review items.
 */
export function getReviewQueue(): ReviewItem[] {
  return [...queue];
}

/**
 * Remove an item from the queue (after user confirms or dismisses it).
 * Returns true if the item was found and removed, false if not found.
 */
export function clearReviewItem(id: string): boolean {
  const idx = queue.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  return true;
}

/**
 * Clear all items (for test teardown).
 */
export function clearAllReviewItems(): void {
  queue.splice(0, queue.length);
  nextId = 1;
}
