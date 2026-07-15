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

/**
 * Process-lifetime singleton — this queue is in-memory only and is reset on
 * each app restart. This is intentional for v1: any pending review items that
 * were not resolved before the app closed are simply re-queued on the next
 * ingestion run (because their message-ids are not yet in processed_emails).
 */
const queue: ReviewItem[] = [];

/**
 * Monotonic counter for review item IDs. Resets to 1 on each app restart —
 * safe because the queue is ephemeral (IDs are only meaningful within a
 * single process lifetime).
 */
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
