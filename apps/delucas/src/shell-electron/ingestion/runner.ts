/**
 * runner.ts — Ingestion runner.
 *
 * Executes all registered IngestionSource instances, deduplicates by
 * source_ref, writes new transactions to SQLite, and records a run report.
 * The run report is kept in memory — only the last run's stats are retained.
 */

import type Database from "better-sqlite3";
import { getTransactionBySourceRef, insertTransaction } from "../db/queries";
import type { IngestionSource, IngestionRunReport, NormalizedTransaction } from "./types";

// ---------------------------------------------------------------------------
// In-memory last-run report
// ---------------------------------------------------------------------------

let lastRunReport: IngestionRunReport | null = null;

export function getLastRunReport(): IngestionRunReport | null {
  return lastRunReport;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run all sources, deduplicate by source_ref, write new transactions.
 * Returns the run report (also stored in module-level state for the bridge).
 */
export async function runSources(
  db: Database.Database,
  sources: IngestionSource[]
): Promise<IngestionRunReport> {
  let found = 0;
  let imported = 0;
  let failed = 0;

  for (const source of sources) {
    let candidates: NormalizedTransaction[] = [];

    try {
      candidates = await source.pull();
    } catch (err) {
      console.error(`[runner] source "${source.name}" pull() threw`, err);
      failed++;
      continue;
    }

    found += candidates.length;

    for (const tx of candidates) {
      try {
        // Deduplicate by source_ref — skip if already in DB
        if (tx.source_ref != null) {
          const existing = getTransactionBySourceRef(db, tx.source_ref);
          if (existing !== undefined) {
            // Already imported — not an error, just skip
            continue;
          }
        }

        insertTransaction(db, tx);
        imported++;
      } catch (err) {
        console.error(`[runner] failed to insert transaction from "${source.name}"`, err);
        failed++;
      }
    }
  }

  const report: IngestionRunReport = {
    found,
    imported,
    failed,
    ran_at: new Date().toISOString(),
  };

  lastRunReport = report;
  return report;
}
