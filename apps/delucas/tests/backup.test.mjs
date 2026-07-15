/**
 * backup.test.mjs — Unit tests for backup.ts
 *
 * Tests:
 *  1. rotateOld keeps at most 30 files (deletes oldest beyond 30)
 *  2. dailyTrigger runs backup when last_backup_date != today
 *  3. dailyTrigger does NOT run backup when last_backup_date == today
 *  4. copyToBackupFolder creates the expected file
 *  5. quitBackup copies the DB to backup folder
 *
 * Pure Node.js (tsx) — no Electron, no browser.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  copyToBackupFolder,
  rotateOld,
  dailyTrigger,
  quitBackup,
  dateString,
} from "../src/shell-electron/backup.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

/** Create a temp directory, return its path. Caller must clean up. */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "delucas-backup-test-"));
}

/** Create a dummy "DB" file to copy. */
function makeDummyDb(dir) {
  const p = path.join(dir, "test.db");
  fs.writeFileSync(p, "SQLite dummy");
  return p;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nBackup — unit checks\n");

// 1. rotateOld — keeps last 30, deletes older ones
test("rotateOld: keeps at most 30 backup files", () => {
  const dir = tmpDir();
  try {
    // Create 35 backup files with distinct dates
    for (let i = 1; i <= 35; i++) {
      const date = `2025-01-${i.toString().padStart(2, "0")}`;
      fs.writeFileSync(path.join(dir, `delucas-backup-${date}.db`), "data");
    }
    rotateOld(dir, 30);
    const remaining = fs.readdirSync(dir).filter((f) => f.startsWith("delucas-backup-"));
    assert.equal(remaining.length, 30, `expected 30 files, got ${remaining.length}`);
    // The oldest 5 (jan 1–5) should be gone; jan 6–35 remain
    for (let i = 1; i <= 5; i++) {
      const date = `2025-01-${i.toString().padStart(2, "0")}`;
      assert.ok(
        !fs.existsSync(path.join(dir, `delucas-backup-${date}.db`)),
        `delucas-backup-${date}.db should have been deleted`
      );
    }
    // Jan 06 should still exist
    assert.ok(
      fs.existsSync(path.join(dir, "delucas-backup-2025-01-06.db")),
      "delucas-backup-2025-01-06.db should still exist"
    );
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("rotateOld: with fewer than 30 files, deletes nothing", () => {
  const dir = tmpDir();
  try {
    for (let i = 1; i <= 10; i++) {
      const date = `2025-02-${i.toString().padStart(2, "0")}`;
      fs.writeFileSync(path.join(dir, `delucas-backup-${date}.db`), "data");
    }
    rotateOld(dir, 30);
    const remaining = fs.readdirSync(dir).filter((f) => f.startsWith("delucas-backup-"));
    assert.equal(remaining.length, 10, `expected 10 files, got ${remaining.length}`);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("rotateOld: ignores non-backup files in the folder", () => {
  const dir = tmpDir();
  try {
    // 35 backups + 2 non-backup files
    for (let i = 1; i <= 35; i++) {
      const date = `2025-03-${i.toString().padStart(2, "0")}`;
      fs.writeFileSync(path.join(dir, `delucas-backup-${date}.db`), "data");
    }
    fs.writeFileSync(path.join(dir, "README.txt"), "ignore me");
    fs.writeFileSync(path.join(dir, "other-backup-2025-03-01.db"), "not a delucas file");
    rotateOld(dir, 30);
    // Non-backup files should be untouched
    assert.ok(fs.existsSync(path.join(dir, "README.txt")), "README.txt should be untouched");
    assert.ok(
      fs.existsSync(path.join(dir, "other-backup-2025-03-01.db")),
      "other-backup file should be untouched"
    );
    // Backup files: only 30 remain
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith("delucas-backup-"));
    assert.equal(backups.length, 30);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// 2. copyToBackupFolder — creates the correct file
test("copyToBackupFolder: creates delucas-backup-<date>.db in folder", () => {
  const srcDir = tmpDir();
  const destDir = tmpDir();
  try {
    const dbPath = makeDummyDb(srcDir);
    const date = "2026-07-15";
    const dest = copyToBackupFolder(dbPath, destDir, date);
    assert.ok(fs.existsSync(dest), `backup file should exist at ${dest}`);
    assert.ok(dest.endsWith(`delucas-backup-${date}.db`), `expected filename with date ${date}`);
    const content = fs.readFileSync(dest, "utf8");
    assert.equal(content, "SQLite dummy", "backup content should match source");
  } finally {
    fs.rmSync(srcDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  }
});

// 3. dailyTrigger — runs backup when last date != today
test("dailyTrigger: runs backup when last_backup_date is different from today", () => {
  const srcDir = tmpDir();
  const destDir = tmpDir();
  try {
    const dbPath = makeDummyDb(srcDir);
    const today = "2026-07-15";
    const settings = { backup_folder: destDir, last_backup_date: "2026-07-14" };

    dailyTrigger({
      dbPath,
      getSetting: (key) => settings[key],
      setSetting: (key, value) => { settings[key] = value; },
      today,
    });

    // Backup file should exist
    assert.ok(
      fs.existsSync(path.join(destDir, `delucas-backup-${today}.db`)),
      `backup file for ${today} should exist`
    );
    // last_backup_date should be updated to today
    assert.equal(settings["last_backup_date"], today, "last_backup_date should be updated");
  } finally {
    fs.rmSync(srcDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  }
});

// 4. dailyTrigger — does NOT run backup when last date == today
test("dailyTrigger: skips backup when last_backup_date equals today", () => {
  const srcDir = tmpDir();
  const destDir = tmpDir();
  try {
    const dbPath = makeDummyDb(srcDir);
    const today = "2026-07-15";
    let setSCalled = 0;
    const settings = { backup_folder: destDir, last_backup_date: today };

    dailyTrigger({
      dbPath,
      getSetting: (key) => settings[key],
      setSetting: (_key, _value) => { setSCalled++; },
      today,
    });

    // No backup file should be written (already backed up today)
    assert.equal(
      fs.readdirSync(destDir).filter((f) => f.startsWith("delucas-backup-")).length,
      0,
      "no backup should be created when already backed up today"
    );
    assert.equal(setSCalled, 0, "setSetting should not be called when skipping");
  } finally {
    fs.rmSync(srcDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  }
});

// 5. dailyTrigger — silently skips when backup_folder not set
test("dailyTrigger: skips silently when backup_folder is not configured", () => {
  const srcDir = tmpDir();
  try {
    const dbPath = makeDummyDb(srcDir);
    let setSCalled = 0;

    // No backup_folder in settings
    dailyTrigger({
      dbPath,
      getSetting: (_key) => undefined,
      setSetting: (_key, _value) => { setSCalled++; },
      today: "2026-07-15",
    });

    // Should not throw, should not call setSetting
    assert.equal(setSCalled, 0, "setSetting should not be called");
  } finally {
    fs.rmSync(srcDir, { recursive: true });
  }
});

// 6. quitBackup — synchronous copy on quit
test("quitBackup: copies DB to backup folder", () => {
  const srcDir = tmpDir();
  const destDir = tmpDir();
  try {
    const dbPath = makeDummyDb(srcDir);
    const today = "2026-07-15";
    const settings = { backup_folder: destDir };

    quitBackup({
      dbPath,
      getSetting: (key) => settings[key],
      today,
    });

    assert.ok(
      fs.existsSync(path.join(destDir, `delucas-backup-${today}.db`)),
      `quit backup file for ${today} should exist`
    );
  } finally {
    fs.rmSync(srcDir, { recursive: true });
    fs.rmSync(destDir, { recursive: true });
  }
});

test("quitBackup: skips when backup_folder not set", () => {
  const srcDir = tmpDir();
  try {
    const dbPath = makeDummyDb(srcDir);
    // Should not throw
    quitBackup({
      dbPath,
      getSetting: (_key) => undefined,
      today: "2026-07-15",
    });
  } finally {
    fs.rmSync(srcDir, { recursive: true });
  }
});

// 7. dateString — returns YYYY-MM-DD
test("dateString: returns correct YYYY-MM-DD for given date", () => {
  const d = new Date("2026-07-15T12:00:00Z");
  // dateString uses local time — just verify the pattern
  const s = dateString(d);
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/, `expected YYYY-MM-DD got ${s}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(`\n  ${passed}/${total} backup checks passed`);

if (failed > 0) {
  console.error(`\n  ${failed} checks failed`);
  process.exit(1);
}
