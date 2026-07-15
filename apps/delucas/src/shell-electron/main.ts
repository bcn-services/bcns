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
  getTransactionsInRange,
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
import { ManualSource } from "./ingestion/sources/manual";
import { RecurringSource } from "./ingestion/sources/recurring";
import { DragDropSource } from "./ingestion/sources/dragdrop";
import { runSources, getLastRunReport } from "./ingestion/runner";
import { extractFromPdfImage } from "./ingestion/llm";
import { pdfFirstPageToBase64 } from "./ingestion/pdf";

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

// ---------------------------------------------------------------------------
// Ingestion source instances (one per app lifetime; single-shot sources reset
// themselves after pull())
// ---------------------------------------------------------------------------

const manualSource = new ManualSource();
const dragDropSource = new DragDropSource();

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
    if (params !== undefined && !Array.isArray(params)) {
      throw new Error("db:query: params must be an array");
    }
    try {
      return db.prepare(sql).all(...(params ?? []));
    } catch (err) {
      console.error("[main] db:query failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:getTransactions
  // ------------------------------------------------------------------
  ipcMain.handle("db:getTransactions", () => {
    try {
      return getTransactions(db);
    } catch (err) {
      console.error("[main] db:getTransactions failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:getTransactionsByMonth — param: "YYYY-MM"
  // ------------------------------------------------------------------
  ipcMain.handle("db:getTransactionsByMonth", (_event, month: string) => {
    try {
      return getTransactionsByMonth(db, month);
    } catch (err) {
      console.error("[main] db:getTransactionsByMonth failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:insertTransaction
  // ------------------------------------------------------------------
  ipcMain.handle("db:insertTransaction", (_event, tx: NewTransaction) => {
    // Runtime validation at the IPC boundary — TypeScript types are erased at
    // runtime; the renderer can send any shape, so validate before touching SQLite.
    const VALID_DIRECTIONS = new Set(["revenue", "expense"]);
    const VALID_CATEGORIES = new Set(["food", "beverage", "utilities", "rent", "labor", "other"]);
    const VALID_SOURCES = new Set(["email", "dragdrop", "manual", "recurring"]);

    if (
      typeof tx !== "object" ||
      tx === null ||
      typeof tx.date !== "string" ||
      typeof tx.vendor !== "string" ||
      !Number.isInteger(tx.amount_cents) ||
      tx.amount_cents <= 0 ||
      !VALID_DIRECTIONS.has(tx.direction) ||
      !VALID_CATEGORIES.has(tx.category) ||
      !VALID_SOURCES.has(tx.source)
    ) {
      return { ok: false, error: "db:insertTransaction: invalid transaction fields" };
    }

    try {
      const id = insertTransaction(db, tx);
      return { ok: true, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] db:insertTransaction failed", err);
      return { ok: false, error: message };
    }
  });

  // ------------------------------------------------------------------
  // db:getMonthPnl — returns MonthPnl for a single month ("YYYY-MM")
  // ------------------------------------------------------------------
  ipcMain.handle("db:getMonthPnl", (_event, month: string) => {
    try {
      const txs = getTransactionsByMonth(db, month);
      return computeMonthPnl(month, txs);
    } catch (err) {
      console.error("[main] db:getMonthPnl failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:get12MonthSeries — returns MonthPnl[] for 12 months ending at endMonth
  // ------------------------------------------------------------------
  ipcMain.handle("db:get12MonthSeries", (_event, endMonth: string) => {
    try {
      // Compute the 12-month window and query only that range to avoid
      // loading unbounded history as the transaction table grows.
      const [endYear, endMonthNum] = endMonth.split("-").map(Number) as [number, number];
      const startMonthNum = endMonthNum - 11;
      const startYear = startMonthNum <= 0 ? endYear - 1 : endYear;
      const normalizedStart = startMonthNum <= 0 ? startMonthNum + 12 : startMonthNum;
      const fromDate = `${startYear}-${normalizedStart.toString().padStart(2, "0")}-01`;
      const toDate = `${endYear}-${endMonth.slice(5)}-31`;
      const txs = getTransactionsInRange(db, fromDate, toDate);
      return compute12MonthSeries(endMonth, txs);
    } catch (err) {
      console.error("[main] db:get12MonthSeries failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:getSummary — plain-English summary for one month
  // ------------------------------------------------------------------
  ipcMain.handle("db:getSummary", (_event, month: string) => {
    try {
      const txs = getTransactionsByMonth(db, month);
      const pnl = computeMonthPnl(month, txs);
      return generateSummary(pnl);
    } catch (err) {
      console.error("[main] db:getSummary failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:getRecurringRules
  // ------------------------------------------------------------------
  ipcMain.handle("db:getRecurringRules", () => {
    try {
      return getRecurringRules(db);
    } catch (err) {
      console.error("[main] db:getRecurringRules failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:materializeRecurring — param: throughMonth "YYYY-MM"
  // ------------------------------------------------------------------
  ipcMain.handle("db:materializeRecurring", (_event, throughMonth: string) => {
    try {
      materializeRecurring(db, throughMonth);
    } catch (err) {
      console.error("[main] db:materializeRecurring failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // email deduplication
  // ------------------------------------------------------------------
  ipcMain.handle("db:isEmailProcessed", (_event, messageId: string) => {
    try {
      return isEmailProcessed(db, messageId);
    } catch (err) {
      console.error("[main] db:isEmailProcessed failed", err);
      throw err;
    }
  });

  ipcMain.handle("db:markEmailProcessed", (_event, messageId: string) => {
    markEmailProcessed(db, messageId);
  });

  // ------------------------------------------------------------------
  // ingestion — P3 implementation
  // ------------------------------------------------------------------

  // Legacy stub (kept for back-compat with any existing callers)
  ipcMain.handle("ingestion:triggerPoll", async () => {
    return;
  });

  // Run all sources: recurring (current month) + any staged manual/dragdrop entries
  ipcMain.handle("ingestion:runSources", async () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    const recurringSource = new RecurringSource(db, currentMonth);
    try {
      return await runSources(db, [recurringSource, manualSource, dragDropSource]);
    } catch (err) {
      console.error("[main] ingestion:runSources failed", err);
      throw err;
    }
  });

  // Submit a manual transaction: stage it and run immediately
  ipcMain.handle("ingestion:submitManual", async (_event, tx: NewTransaction) => {
    // Validate at IPC boundary
    const VALID_DIRECTIONS = new Set(["revenue", "expense"]);
    const VALID_CATEGORIES = new Set(["food", "beverage", "utilities", "rent", "labor", "other"]);
    if (
      typeof tx !== "object" ||
      tx === null ||
      typeof tx.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(tx.date) ||
      typeof tx.vendor !== "string" ||
      !Number.isInteger(tx.amount_cents) ||
      tx.amount_cents <= 0 ||
      !VALID_DIRECTIONS.has(tx.direction) ||
      !VALID_CATEGORIES.has(tx.category)
    ) {
      throw new Error("ingestion:submitManual: invalid transaction fields");
    }
    manualSource.stage(tx);
    try {
      return await runSources(db, [manualSource]);
    } catch (err) {
      console.error("[main] ingestion:submitManual failed", err);
      throw err;
    }
  });

  // Return the last ingestion run report (in-memory, survives until next run)
  ipcMain.handle("ingestion:getLastRunReport", () => {
    return getLastRunReport();
  });

  // Process a PDF: pdf→image→LLM extraction, return structured result to renderer
  ipcMain.handle("ingestion:processPdf", async (_event, filePath: string) => {
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error("ingestion:processPdf: filePath must be a non-empty string");
    }

    // Path-containment check: only allow files under the user's home directory
    // (covers Downloads, Desktop, Documents) to prevent renderer-supplied
    // path traversal attacks.
    const resolvedPath = path.resolve(filePath);
    const homeDir = app.getPath("home");
    if (!resolvedPath.startsWith(homeDir + path.sep) && resolvedPath !== homeDir) {
      throw new Error("ingestion:processPdf: file path is outside the user home directory");
    }

    try {
      const base64Image = await pdfFirstPageToBase64(resolvedPath);
      return await extractFromPdfImage(base64Image);
    } catch (err) {
      // Strip the resolved path from pdfjs error messages before forwarding to renderer
      const message = err instanceof Error ? err.message.replaceAll(resolvedPath, "[redacted]") : String(err);
      console.error("[main] ingestion:processPdf failed", err);
      throw new Error(message);
    }
  });

  // Confirm and save an LLM-extracted + user-reviewed transaction
  ipcMain.handle("ingestion:confirmImport", async (_event, tx: NewTransaction) => {
    // Validate at IPC boundary
    const VALID_DIRECTIONS = new Set(["revenue", "expense"]);
    const VALID_CATEGORIES = new Set(["food", "beverage", "utilities", "rent", "labor", "other"]);
    const VALID_SOURCES = new Set(["email", "dragdrop", "manual", "recurring"]);
    if (
      typeof tx !== "object" ||
      tx === null ||
      typeof tx.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(tx.date) ||
      typeof tx.vendor !== "string" ||
      !Number.isInteger(tx.amount_cents) ||
      tx.amount_cents <= 0 ||
      !VALID_DIRECTIONS.has(tx.direction) ||
      !VALID_CATEGORIES.has(tx.category) ||
      !VALID_SOURCES.has(tx.source)
    ) {
      throw new Error("ingestion:confirmImport: invalid transaction fields");
    }
    dragDropSource.stage(tx);
    try {
      return await runSources(db, [dragDropSource]);
    } catch (err) {
      console.error("[main] ingestion:confirmImport failed", err);
      throw err;
    }
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
    try {
      return getSetting(db, key);
    } catch (err) {
      console.error("[main] settings:get failed", err);
      throw err;
    }
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`settings:set: value must be a string or number, got ${typeof value}`);
    }
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
