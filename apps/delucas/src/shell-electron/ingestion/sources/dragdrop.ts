/**
 * dragdrop.ts — Drag-and-drop PDF ingestion source.
 *
 * This source is single-shot: the main process stages one confirmed
 * NormalizedTransaction after the renderer approves a ConfirmCard, then
 * the runner writes it. The heavy lifting (PDF→image→LLM) happens outside
 * this source — in the IPC handler for ingestion:processPdf — which calls
 * extractFromPdfImage and returns LLMExtractResult to the renderer.
 * The renderer shows the ConfirmCard, user approves, and ingestion:confirmImport
 * stages the transaction here.
 */

import type { IngestionSource, NormalizedTransaction } from "../types";

export class DragDropSource implements IngestionSource {
  readonly name = "dragdrop";

  private pending: NormalizedTransaction | null = null;

  /**
   * Stage a confirmed transaction for the next pull().
   * Called by the ingestion:confirmImport IPC handler.
   */
  stage(tx: NormalizedTransaction): void {
    this.pending = tx;
  }

  async pull(): Promise<NormalizedTransaction[]> {
    if (this.pending === null) return [];
    const tx = this.pending;
    this.pending = null;
    return [tx];
  }
}
