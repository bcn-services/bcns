/**
 * backup.ts — SQLite backup logic for DeLuca's.
 *
 * Responsibilities:
 *  - copyToBackupFolder: copy the DB file to <folder>/delucas-backup-<date>.db
 *  - rotateOld: keep only the 30 most recent backup files, delete the rest
 *  - dailyTrigger: run backup at most once per calendar day (reads/writes last_backup_date setting)
 *  - quit trigger: synchronous copy on app quit (better-sqlite3 is sync; use fs.copyFileSync)
 *
 * All functions are pure and injectable (no module-level singletons) so every
 * boundary has a test seam.
 */

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// In-memory backup status (accessible via IPC)
// ---------------------------------------------------------------------------

export interface BackupStatus {
  lastBackup: string | null;
  error: string | null;
}

const backupStatus: BackupStatus = {
  lastBackup: null,
  error: null,
};

export function getBackupStatus(): BackupStatus {
  return { ...backupStatus };
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Returns "YYYY-MM-DD" for a given Date object (or today if omitted). */
export function dateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Filename pattern for backup files. */
const BACKUP_PREFIX = "delucas-backup-";
const BACKUP_SUFFIX = ".db";
const MAX_BACKUPS = 30;

function backupFilename(date: string): string {
  return `${BACKUP_PREFIX}${date}${BACKUP_SUFFIX}`;
}

/**
 * Copy dbPath to <backupFolder>/delucas-backup-<date>.db.
 * Throws on any fs error (caller decides how to surface it).
 */
export function copyToBackupFolder(
  dbPath: string,
  backupFolder: string,
  date: string = dateString()
): string {
  const dest = path.join(backupFolder, backupFilename(date));
  fs.copyFileSync(dbPath, dest);
  return dest;
}

/**
 * Delete oldest backup files beyond MAX_BACKUPS.
 * Files are sorted alphabetically (ISO date in name → alphabetical = chronological).
 * The newest MAX_BACKUPS are kept; everything older is deleted.
 * Does not throw — logs failures per file and moves on.
 */
export function rotateOld(backupFolder: string, maxBackups: number = MAX_BACKUPS): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(backupFolder);
  } catch {
    return; // folder gone — nothing to rotate
  }

  const backups = entries
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_SUFFIX))
    .sort(); // ISO date in name → alphabetical = oldest first

  const toDelete = backups.slice(0, Math.max(0, backups.length - maxBackups));
  for (const file of toDelete) {
    try {
      fs.unlinkSync(path.join(backupFolder, file));
    } catch (err) {
      console.error(`[backup] failed to delete old backup ${file}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Dependency-injected backup runner
// ---------------------------------------------------------------------------

export interface BackupDeps {
  dbPath: string;
  /** Read a setting value (may return undefined if not set). */
  getSetting: (key: string) => string | undefined;
  /** Write a setting value. */
  setSetting: (key: string, value: string) => void;
  /** Override today's date string for testing. */
  today?: string;
}

/**
 * Run a backup: copy + rotate, then update backupStatus in memory.
 * Does not throw — captures errors into backupStatus.error.
 */
function runBackup(dbPath: string, backupFolder: string, today: string): void {
  try {
    copyToBackupFolder(dbPath, backupFolder, today);
    rotateOld(backupFolder);
    backupStatus.lastBackup = today;
    backupStatus.error = null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backup] backup failed:", err);
    backupStatus.error = message;
  }
}

/**
 * dailyTrigger — run backup at most once per calendar day on app open.
 *
 * Reads `last_backup_date` from settings. If it is not today's date,
 * runs the backup and updates the setting to today. If backup_folder is
 * not configured, skips silently.
 */
export function dailyTrigger(deps: BackupDeps): void {
  const backupFolder = deps.getSetting("backup_folder");
  if (!backupFolder) return; // not configured — skip silently

  const today = deps.today ?? dateString();
  const lastDate = deps.getSetting("last_backup_date");

  if (lastDate === today) return; // already backed up today

  // Ensure backup folder exists
  try {
    fs.mkdirSync(backupFolder, { recursive: true });
  } catch (err) {
    backupStatus.error = err instanceof Error ? err.message : String(err);
    return;
  }

  runBackup(deps.dbPath, backupFolder, today);

  if (backupStatus.error === null) {
    try {
      deps.setSetting("last_backup_date", today);
    } catch (err) {
      console.error("[backup] failed to persist last_backup_date:", err);
    }
  }
}

/**
 * quitBackup — synchronous backup on app quit.
 *
 * better-sqlite3 is synchronous, and copyFileSync is synchronous, so this
 * is safe to call in a before-quit handler without async complications.
 * If backup_folder is not configured, skips silently.
 */
export function quitBackup(deps: Omit<BackupDeps, "setSetting"> & { getSetting: (k: string) => string | undefined }): void {
  const backupFolder = deps.getSetting("backup_folder");
  if (!backupFolder) return;

  const today = deps.today ?? dateString();

  try {
    fs.mkdirSync(backupFolder, { recursive: true });
  } catch {
    return;
  }

  runBackup(deps.dbPath, backupFolder, today);
}

/**
 * Convenience: build BackupDeps from a live DB handle + queries.
 */
export function buildBackupDeps(
  db: Database.Database,
  dbPath: string,
  getSetting: (db: Database.Database, key: string) => string | undefined,
  setSetting: (db: Database.Database, key: string, value: string) => void,
  today?: string
): BackupDeps {
  return {
    dbPath,
    getSetting: (key) => getSetting(db, key),
    setSetting: (key, value) => setSetting(db, key, value),
    today,
  };
}
