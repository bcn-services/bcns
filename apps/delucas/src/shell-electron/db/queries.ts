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

export function getTransactionBySourceRef(
  db: Database.Database,
  sourceRef: string
): Transaction | undefined {
  return db
    .prepare<[string], Transaction>(
      "SELECT * FROM transactions WHERE source_ref = ? LIMIT 1"
    )
    .get(sourceRef);
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

export interface TransactionUpdates {
  date?: string;
  amount_cents?: number;
  direction?: string;
  category?: string;
  vendor?: string;
}

export function updateTransaction(
  db: Database.Database,
  id: number,
  updates: TransactionUpdates
): boolean {
  const fields = Object.keys(updates) as (keyof TransactionUpdates)[];
  if (fields.length === 0) return false;
  const setClauses = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => updates[f]);
  const result = db
    .prepare(`UPDATE transactions SET ${setClauses} WHERE id = ?`)
    .run(...values, id);
  return result.changes > 0;
}

export function deleteTransaction(db: Database.Database, id: number): boolean {
  const result = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------

export function getRecurringRules(db: Database.Database): RecurringRule[] {
  return db
    .prepare<[], RecurringRule>("SELECT * FROM recurring_rules ORDER BY id ASC")
    .all();
}

export interface RecurringRuleUpdates {
  label?: string;
  amount_cents?: number;
  direction?: string;
  category?: string;
  vendor?: string;
  day_of_month?: number;
  end_date?: string | null;
}

export function insertRecurringRule(
  db: Database.Database,
  rule: Omit<RecurringRule, "id">
): number {
  const result = db
    .prepare<
      [string, number, string, string, string, number, string, string | null],
      { id: number }
    >(
      `INSERT INTO recurring_rules (label, amount_cents, direction, category, vendor, day_of_month, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      rule.label,
      rule.amount_cents,
      rule.direction,
      rule.category,
      rule.vendor,
      rule.day_of_month,
      rule.start_date,
      rule.end_date ?? null
    );
  if (result === undefined) throw new Error("insertRecurringRule: no id returned");
  return result.id;
}

export function updateRecurringRule(
  db: Database.Database,
  id: number,
  updates: RecurringRuleUpdates
): boolean {
  const fields = Object.keys(updates) as (keyof RecurringRuleUpdates)[];
  if (fields.length === 0) return false;
  const setClauses = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => updates[f]);
  const result = db
    .prepare(`UPDATE recurring_rules SET ${setClauses} WHERE id = ?`)
    .run(...values, id);
  return result.changes > 0;
}

export function deleteRecurringRule(db: Database.Database, id: number): boolean {
  const result = db.prepare("DELETE FROM recurring_rules WHERE id = ?").run(id);
  return result.changes > 0;
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
