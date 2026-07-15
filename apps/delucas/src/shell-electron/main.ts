/**
 * main.ts — Electron main process.
 *
 * Creates the BrowserWindow, opens the SQLite database, runs migrations,
 * materializes recurring transactions, and registers ipcMain handlers.
 */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "./db/migrations";
import {
  getTransactions,
  getTransactionsByMonth,
  insertTransaction,
  getRecurringRules,
  getSetting,
  setSetting,
  isEmailProcessed,
  markEmailProcessed,
} from "./db/queries";
import { materializeRecurring } from "./recurring";
import { compute12MonthSeries, computeMonthPnl, generateSummary } from "../shared/pnl";
import type { NewTransaction } from "../shared/types";

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const DB_PATH = path.join(app.getPath("userData"), "delucas.db");

function openDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  // Enable WAL for better concurrent read performance
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env["ELECTRON_RENDERER_URL"] != null) {
    // electron-vite injects this in dev mode
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]).catch(err => console.error("[main] load failed", err));
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html")).catch(err => console.error("[main] load failed", err));
  }

  return win;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(db: Database.Database): void {
  // ------------------------------------------------------------------
  // db:query — generic parameterized SQL (read-only; SELECT only)
  // SECURITY: only SELECT statements allowed — prevents writes via this channel
  // ------------------------------------------------------------------
  ipcMain.handle("db:query", (_event, sql: string, params?: unknown[]) => {
    const normalized = sql.trimStart().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
      throw new Error("db:query only permits SELECT statements");
    }
    return db.prepare(sql).all(...(params ?? []));
  });

  // ------------------------------------------------------------------
  // db:getTransactions
  // ------------------------------------------------------------------
  ipcMain.handle("db:getTransactions", () => {
    return getTransactions(db);
  });

  // ------------------------------------------------------------------
  // db:getTransactionsByMonth — param: "YYYY-MM"
  // ------------------------------------------------------------------
  ipcMain.handle("db:getTransactionsByMonth", (_event, month: string) => {
    return getTransactionsByMonth(db, month);
  });

  // ------------------------------------------------------------------
  // db:insertTransaction
  // ------------------------------------------------------------------
  ipcMain.handle("db:insertTransaction", (_event, tx: NewTransaction) => {
    return insertTransaction(db, tx);
  });

  // ------------------------------------------------------------------
  // db:getMonthPnl — returns MonthPnl for a single month ("YYYY-MM")
  // ------------------------------------------------------------------
  ipcMain.handle("db:getMonthPnl", (_event, month: string) => {
    const txs = getTransactionsByMonth(db, month);
    return computeMonthPnl(month, txs);
  });

  // ------------------------------------------------------------------
  // db:get12MonthSeries — returns MonthPnl[] for 12 months ending at endMonth
  // ------------------------------------------------------------------
  ipcMain.handle("db:get12MonthSeries", (_event, endMonth: string) => {
    const txs = getTransactions(db);
    return compute12MonthSeries(endMonth, txs);
  });

  // ------------------------------------------------------------------
  // db:getSummary — plain-English summary for one month
  // ------------------------------------------------------------------
  ipcMain.handle("db:getSummary", (_event, month: string) => {
    const txs = getTransactionsByMonth(db, month);
    const pnl = computeMonthPnl(month, txs);
    return generateSummary(pnl);
  });

  // ------------------------------------------------------------------
  // db:getRecurringRules
  // ------------------------------------------------------------------
  ipcMain.handle("db:getRecurringRules", () => {
    return getRecurringRules(db);
  });

  // ------------------------------------------------------------------
  // db:materializeRecurring — param: throughMonth "YYYY-MM"
  // ------------------------------------------------------------------
  ipcMain.handle("db:materializeRecurring", (_event, throughMonth: string) => {
    materializeRecurring(db, throughMonth);
  });

  // ------------------------------------------------------------------
  // email deduplication
  // ------------------------------------------------------------------
  ipcMain.handle("db:isEmailProcessed", (_event, messageId: string) => {
    return isEmailProcessed(db, messageId);
  });

  ipcMain.handle("db:markEmailProcessed", (_event, messageId: string) => {
    markEmailProcessed(db, messageId);
  });

  // ------------------------------------------------------------------
  // ingestion — stub (implemented in P3/P4)
  // ------------------------------------------------------------------
  ipcMain.handle("ingestion:triggerPoll", async () => {
    return;
  });

  // ------------------------------------------------------------------
  // dialog — fully implemented
  // ------------------------------------------------------------------
  ipcMain.handle(
    "dialog:openFile",
    async (
      _event,
      options?: { filters?: Array<{ name: string; extensions: string[] }> }
    ) => {
      const result = await dialog.showOpenDialog({ properties: ["openFile"], ...options });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }
  );

  ipcMain.handle("dialog:openDirectory", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // ------------------------------------------------------------------
  // settings
  // ------------------------------------------------------------------
  ipcMain.handle("settings:get", (_event, key: string) => {
    return getSetting(db, key);
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    setSetting(db, key, String(value));
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  let db: Database.Database;
  try {
    db = openDatabase();
  } catch (err) {
    console.error("[main] DB init failed", err);
    app.quit();
    return;
  }

  // Materialize recurring transactions through the current month on startup
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  try {
    materializeRecurring(db, currentMonth);
  } catch (err) {
    console.error("[main] recurring materialization failed", err);
  }

  registerIpcHandlers(db);

  try {
    createWindow();
  } catch (err) {
    console.error("[main] createWindow failed", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        createWindow();
      } catch (err) {
        console.error("[main] createWindow failed", err);
        app.quit();
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
