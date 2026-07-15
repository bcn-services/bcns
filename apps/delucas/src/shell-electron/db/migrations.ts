/**
 * migrations.ts — Run-on-start migration runner.
 *
 * Creates a `schema_migrations` table to track which migrations have
 * already been applied, then applies any pending ones in order.
 * Each migration runs inside a transaction — if it throws, the whole
 * migration is rolled back and the error propagates.
 */

import type Database from "better-sqlite3";
import { MIGRATIONS } from "./schema";

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER NOT NULL PRIMARY KEY,
    applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`;

/**
 * Apply all pending migrations to `db`.
 * Safe to call multiple times — already-applied migrations are skipped.
 */
export function runMigrations(db: Database.Database): void {
  // Ensure the tracking table exists
  db.exec(MIGRATIONS_TABLE);

  const getApplied = db.prepare<[], { version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  const applied = new Set(getApplied.all().map((r) => r.version));

  const insertVersion = db.prepare(
    "INSERT INTO schema_migrations (version) VALUES (?)"
  );

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1; // 1-based
    if (applied.has(version)) continue;

    const sql = MIGRATIONS[i];
    if (sql === undefined) continue;

    // Run each migration atomically
    const apply = db.transaction(() => {
      db.exec(sql);
      insertVersion.run(version);
    });

    apply();
  }
}
