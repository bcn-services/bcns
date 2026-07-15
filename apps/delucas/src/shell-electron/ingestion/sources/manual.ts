/**
 * manual.ts — Manual entry ingestion source.
 *
 * Passthrough source: the renderer submits a pre-formed NewTransaction
 * via the IPC bridge. The runner writes it directly with no further
 * transformation. source_ref is null for manual entries (no dedup needed —
 * the user explicitly submitted each one).
 *
 * Usage: ManualSource is a single-shot source — it holds one pending
 * transaction submitted from the renderer, yields it on pull(), then clears.
 * For bulk runs, the runner uses the recurring/dragdrop sources instead.
 */

import type { IngestionSource, NormalizedTransaction } from "../types";
import type { NewTransaction } from "../../../shared/types";

export class ManualSource implements IngestionSource {
  readonly name = "manual";

  private pending: NormalizedTransaction | null = null;

  /**
   * Stage a transaction submitted by the renderer.
   * Called by the IPC handler before running the source.
   */
  stage(tx: NewTransaction): void {
    this.pending = {
      ...tx,
      source: "manual",
      source_ref: null,
    };
  }

  async pull(): Promise<NormalizedTransaction[]> {
    if (this.pending === null) return [];
    const tx = this.pending;
    this.pending = null;
    return [tx];
  }
}
