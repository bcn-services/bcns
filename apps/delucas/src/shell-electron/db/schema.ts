/**
 * schema.ts — SQLite table definitions and migration SQL.
 *
 * Each entry in MIGRATIONS is applied in order, exactly once, tracked
 * by the `schema_version` table. All monetary values stored as INTEGER
 * cents; all dates as ISO 8601 strings (YYYY-MM-DD).
 */

export const MIGRATIONS: readonly string[] = [
  // Migration 1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
    direction   TEXT    NOT NULL CHECK(direction IN ('revenue', 'expense')),
    category    TEXT    NOT NULL CHECK(category IN ('food', 'beverage', 'utilities', 'rent', 'labor', 'other')),
    vendor      TEXT    NOT NULL DEFAULT '',
    source      TEXT    NOT NULL CHECK(source IN ('email', 'dragdrop', 'manual', 'recurring')),
    source_ref  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);
  CREATE INDEX IF NOT EXISTS idx_transactions_source_ref ON transactions(source_ref);

  CREATE TABLE IF NOT EXISTS recurring_rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    label        TEXT    NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
    direction    TEXT    NOT NULL CHECK(direction IN ('revenue', 'expense')),
    category     TEXT    NOT NULL CHECK(category IN ('food', 'beverage', 'utilities', 'rent', 'labor', 'other')),
    vendor       TEXT    NOT NULL DEFAULT '',
    day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 28),
    start_date   TEXT    NOT NULL,
    end_date     TEXT
  );

  CREATE TABLE IF NOT EXISTS processed_emails (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id   TEXT    NOT NULL UNIQUE,
    processed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_processed_emails_message_id ON processed_emails(message_id);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
