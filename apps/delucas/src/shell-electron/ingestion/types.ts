/**
 * types.ts — Ingestion framework types.
 *
 * IngestionSource interface and NormalizedTransaction live here.
 * No electron or node:* imports — safe to import from any context.
 */

import type { NewTransaction } from "../../shared/types";

// ---------------------------------------------------------------------------
// NormalizedTransaction
// ---------------------------------------------------------------------------

/**
 * The common shape every ingestion source must produce.
 * This is exactly NewTransaction — the runner writes these directly.
 */
export type NormalizedTransaction = NewTransaction;

// ---------------------------------------------------------------------------
// IngestionSource
// ---------------------------------------------------------------------------

/**
 * Represents the last run report stored in memory.
 * Found = total candidates a source produced.
 * Imported = new rows written (deduped successfully).
 * Failed = records that errored during normalization or write.
 */
export interface IngestionRunReport {
  found: number;
  imported: number;
  failed: number;
  /** ISO 8601 timestamp of the run */
  ran_at: string;
}

/**
 * Contract every ingestion source must satisfy.
 *
 * `pull()` is called by the runner on each ingestion run.
 * It returns an array of NormalizedTransaction candidates.
 * The runner handles deduplication and writing.
 */
export interface IngestionSource {
  /** Stable identifier used in logging */
  readonly name: string;

  /**
   * Produce transaction candidates for this run.
   * Errors thrown here are caught per-source; partial failures are recorded.
   */
  pull(): Promise<NormalizedTransaction[]>;
}
