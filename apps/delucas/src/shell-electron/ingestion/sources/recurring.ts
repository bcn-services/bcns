/**
 * recurring.ts — Recurring rules ingestion source.
 *
 * Wraps the P2 materializeRecurring() function as an IngestionSource.
 * On pull(), it materializes all outstanding recurring transactions for the
 * current month, then returns those rows for the runner to write.
 *
 * Since materializeRecurring() writes directly to SQLite (idempotent via
 * source_ref), this source returns the materialized rows for reporting but
 * relies on the existing materializer for the actual writes. The runner will
 * encounter them as already-imported on its dedup check — that's fine; found
 * count reflects what the materializer produced, imported count reflects net new.
 *
 * Simpler alternative adopted here: pull() materializes and returns an empty
 * array — the runner's job is just to trigger it. The run report credits
 * recurring under "found=0, imported=0" which is honest (writes already happened).
 * This avoids double-write complexity while still integrating recurring into
 * the ingestion lifecycle.
 */

import type Database from "better-sqlite3";
import { materializeRecurring } from "../../recurring";
import type { IngestionSource, NormalizedTransaction } from "../types";

export class RecurringSource implements IngestionSource {
  readonly name = "recurring";

  constructor(
    private readonly db: Database.Database,
    private readonly throughMonth: string
  ) {}

  async pull(): Promise<NormalizedTransaction[]> {
    // materializeRecurring writes directly and is idempotent.
    // We return [] — the runner skips dedup/write for these; the materializer
    // owns the write path for recurring transactions.
    materializeRecurring(this.db, this.throughMonth);
    return [];
  }
}
