/**
 * queries.ts — Typed query functions for the DeLuca's SQLite database.
 *
 * All functions take a `db` handle so they can be used without a module-level
 * singleton — makes testing easier. Parameterized queries throughout.
 */

import type Database from "better-sqlite3";
import type {
  Transaction,
  NewTransaction,
  RecurringRule,
  ProcessedEmail,
  Setting,
} from "../../shared/types";

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export function getTransactions(db: Database.Database): Transaction[] {
  return db
    .prepare<[], Transaction>("SELECT * FROM transactions ORDER BY date DESC, id DESC")
    .all();
}

export function getTransactionsByMonth(
  db: Database.Database,
  monthPrefix: string
): Transaction[] {
  // monthPrefix is "YYYY-MM"; date column is "YYYY-MM-DD"
  if (!/^\d{4}-\d{2}$/.test(monthPrefix)) {
    throw new Error(`getTransactionsByMonth: invalid month format "${monthPrefix}" (expected YYYY-MM)`);
  }
  return db
    .prepare<[string], Transaction>(
      "SELECT * FROM transactions WHERE date LIKE ? ORDER BY date ASC"
    )
    .all(`${monthPrefix}-%`);
}

export function getTransactionsInRange(
  db: Database.Database,
  from: string,
  to: string
): Transaction[] {
  // from/to are "YYYY-MM-DD"; selects rows where date >= from AND date <= to
  return db
    .prepare<[string, string], Transaction>(
      "SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC"
    )
    .all(from, to);
}

export function insertTransaction(
  db: Database.Database,
  tx: NewTransaction
): number {
  const result = db
    .prepare<
      [string, number, string, string, string, string, string | null],
      { id: number }
    >(
      `INSERT INTO transactions (date, amount_cents, direction, category, vendor, source, source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      tx.date,
      tx.amount_cents,
      tx.direction,
      tx.category,
      tx.vendor,
      tx.source,
      tx.source_ref ?? null
    );
  if (result === undefined) throw new Error("insertTransaction: no id returned");
  return result.id;
}

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------

export function getRecurringRules(db: Database.Database): RecurringRule[] {
  return db
    .prepare<[], RecurringRule>("SELECT * FROM recurring_rules ORDER BY id ASC")
    .all();
}

// ---------------------------------------------------------------------------
// Processed emails (deduplication)
// ---------------------------------------------------------------------------

export function isEmailProcessed(
  db: Database.Database,
  messageId: string
): boolean {
  const row = db
    .prepare<[string], { id: number }>(
      "SELECT id FROM processed_emails WHERE message_id = ?"
    )
    .get(messageId);
  return row !== undefined;
}

export function markEmailProcessed(
  db: Database.Database,
  messageId: string
): void {
  db.prepare<[string]>(
    "INSERT OR IGNORE INTO processed_emails (message_id) VALUES (?)"
  ).run(messageId);
}

export function getProcessedEmails(db: Database.Database): ProcessedEmail[] {
  return db
    .prepare<[], ProcessedEmail>(
      "SELECT * FROM processed_emails ORDER BY processed_at DESC"
    )
    .all();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSetting(
  db: Database.Database,
  key: string
): string | undefined {
  const row = db
    .prepare<[string], Setting>("SELECT key, value FROM settings WHERE key = ?")
    .get(key);
  return row?.value;
}

export function setSetting(
  db: Database.Database,
  key: string,
  value: string
): void {
  db.prepare<[string, string]>(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
