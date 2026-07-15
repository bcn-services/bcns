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
  updateTransaction,
  deleteTransaction,
  getRecurringRules,
  insertRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  getSetting,
  setSetting,
  isEmailProcessed,
  markEmailProcessed,
} from "./db/queries";
import { materializeRecurring } from "./recurring";
import {
  buildBackupDeps,
  dailyTrigger,
  quitBackup,
  getBackupStatus,
  copyToBackupFolder,
  rotateOld,
  dateString,
} from "./backup";
import { compute12MonthSeries, computeMonthPnl, generateSummary } from "../shared/pnl";
import type { NewTransaction } from "../shared/types";
import { ManualSource } from "./ingestion/sources/manual";
import { RecurringSource } from "./ingestion/sources/recurring";
import { DragDropSource } from "./ingestion/sources/dragdrop";
import { EmailSource, getEmailStatus, setEmailError } from "./ingestion/sources/email";
import { runSources, getLastRunReport } from "./ingestion/runner";
import { extractFromPdfImage } from "./ingestion/llm";
import { pdfFirstPageToBase64 } from "./ingestion/pdf";
import { getReviewQueue, clearReviewItem } from "./ingestion/review-queue";
import type { ImapConfig } from "./ingestion/imap";

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

// EmailSource is created after db is ready (needs db reference).
// We use a factory so it can read current IMAP config from settings at run time.
let emailSource: EmailSource | null = null;

// ---------------------------------------------------------------------------
// IMAP config helper — reads host/user/password/port/secure from settings
// ---------------------------------------------------------------------------

function getImapConfig(db: Database.Database): ImapConfig | null {
  const host = getSetting(db, "imap_host");
  const user = getSetting(db, "imap_user");
  const password = getSetting(db, "imap_password");
  if (!host || !user || !password) return null;

  const portRaw = getSetting(db, "imap_port");
  const secureRaw = getSetting(db, "imap_secure");

  if (portRaw !== undefined) {
    const port = parseInt(portRaw, 10);
    if (Number.isNaN(port)) {
      console.warn(`[main] imap_port setting "${portRaw}" is not a valid integer — skipping IMAP connection`);
      setEmailError("Invalid IMAP port in settings");
      return null;
    }
    return {
      host,
      user,
      password,
      port,
      secure: secureRaw !== undefined ? secureRaw !== "false" : true,
    };
  }

  return {
    host,
    user,
    password,
    port: 993,
    secure: secureRaw !== undefined ? secureRaw !== "false" : true,
  };
}

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
  // db:getTransactionsForMonth — P5 alias for getTransactionsByMonth
  // ------------------------------------------------------------------
  ipcMain.handle("db:getTransactionsForMonth", (_event, month: string) => {
    if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("db:getTransactionsForMonth: month must be YYYY-MM");
    }
    try {
      return getTransactionsByMonth(db, month);
    } catch (err) {
      console.error("[main] db:getTransactionsForMonth failed", err);
      throw err;
    }
  });

  // ------------------------------------------------------------------
  // db:updateTransaction — P5
  // ------------------------------------------------------------------
  ipcMain.handle("db:updateTransaction", (_event, id: number, updates: Record<string, unknown>) => {
    const VALID_DIRECTIONS = new Set(["revenue", "expense"]);
    const VALID_CATEGORIES = new Set(["food", "beverage", "utilities", "rent", "labor", "other"]);

    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "db:updateTransaction: id must be a positive integer" };
    }
    if (typeof updates !== "object" || updates === null) {
      return { ok: false, error: "db:updateTransaction: updates must be an object" };
    }

    const validated: Record<string, unknown> = {};
    if (updates["date"] !== undefined) {
      if (typeof updates["date"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(updates["date"])) {
        return { ok: false, error: "db:updateTransaction: date must be YYYY-MM-DD" };
      }
      validated["date"] = updates["date"];
    }
    if (updates["amount_cents"] !== undefined) {
      if (!Number.isInteger(updates["amount_cents"]) || (updates["amount_cents"] as number) <= 0) {
        return { ok: false, error: "db:updateTransaction: amount_cents must be a positive integer" };
      }
      validated["amount_cents"] = updates["amount_cents"];
    }
    if (updates["direction"] !== undefined) {
      if (!VALID_DIRECTIONS.has(updates["direction"] as string)) {
        return { ok: false, error: "db:updateTransaction: invalid direction" };
      }
      validated["direction"] = updates["direction"];
    }
    if (updates["category"] !== undefined) {
      if (!VALID_CATEGORIES.has(updates["category"] as string)) {
        return { ok: false, error: "db:updateTransaction: invalid category" };
      }
      validated["category"] = updates["category"];
    }
    if (updates["vendor"] !== undefined) {
      if (typeof updates["vendor"] !== "string" || (updates["vendor"] as string).trim() === "") {
        return { ok: false, error: "db:updateTransaction: vendor must be a non-empty string" };
      }
      validated["vendor"] = updates["vendor"];
    }

    try {
      const changed = updateTransaction(db, id, validated);
      return changed ? { ok: true } : { ok: false, error: "Transaction not found" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] db:updateTransaction failed", err);
      return { ok: false, error: message };
    }
  });

  // ------------------------------------------------------------------
  // db:deleteTransaction — P5
  // ------------------------------------------------------------------
  ipcMain.handle("db:deleteTransaction", (_event, id: number) => {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "db:deleteTransaction: id must be a positive integer" };
    }
    try {
      const changed = deleteTransaction(db, id);
      return changed ? { ok: true } : { ok: false, error: "Transaction not found" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] db:deleteTransaction failed", err);
      return { ok: false, error: message };
    }
  });

  // ------------------------------------------------------------------
  // db:insertRecurringRule — P5
  // ------------------------------------------------------------------
  ipcMain.handle("db:insertRecurringRule", (_event, rule: Record<string, unknown>) => {
    const VALID_DIRECTIONS = new Set(["revenue", "expense"]);
    const VALID_CATEGORIES = new Set(["food", "beverage", "utilities", "rent", "labor", "other"]);
    if (
      typeof rule !== "object" || rule === null ||
      typeof rule["label"] !== "string" || (rule["label"] as string).trim() === "" ||
      !Number.isInteger(rule["amount_cents"]) || (rule["amount_cents"] as number) <= 0 ||
      !VALID_DIRECTIONS.has(rule["direction"] as string) ||
      !VALID_CATEGORIES.has(rule["category"] as string) ||
      typeof rule["vendor"] !== "string" || (rule["vendor"] as string).trim() === "" ||
      !Number.isInteger(rule["day_of_month"]) ||
      (rule["day_of_month"] as number) < 1 || (rule["day_of_month"] as number) > 28 ||
      typeof rule["start_date"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rule["start_date"] as string)
    ) {
      return { ok: false, error: "db:insertRecurringRule: invalid rule fields" };
    }
    try {
      const id = insertRecurringRule(db, {
        label: (rule["label"] as string).trim(),
        amount_cents: rule["amount_cents"] as number,
        direction: rule["direction"] as "revenue" | "expense",
        category: rule["category"] as import("../shared/types").TransactionCategory,
        vendor: (rule["vendor"] as string).trim(),
        day_of_month: rule["day_of_month"] as number,
        start_date: rule["start_date"] as string,
        end_date: rule["end_date"] != null ? (rule["end_date"] as string) : null,
      });
      return { ok: true, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] db:insertRecurringRule failed", err);
      return { ok: false, error: message };
    }
  });

  // ------------------------------------------------------------------
  // db:updateRecurringRule — P5
  // ------------------------------------------------------------------
  ipcMain.handle("db:updateRecurringRule", (_event, id: number, updates: Record<string, unknown>) => {
    const VALID_CATEGORIES = new Set(["food", "beverage", "utilities", "rent", "labor", "other"]);

    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "db:updateRecurringRule: id must be a positive integer" };
    }
    if (typeof updates !== "object" || updates === null) {
      return { ok: false, error: "db:updateRecurringRule: updates must be an object" };
    }

    const validated: Record<string, unknown> = {};
    if (updates["amount_cents"] !== undefined) {
      if (!Number.isInteger(updates["amount_cents"]) || (updates["amount_cents"] as number) <= 0) {
        return { ok: false, error: "db:updateRecurringRule: amount_cents must be a positive integer" };
      }
      validated["amount_cents"] = updates["amount_cents"];
    }
    if (updates["day_of_month"] !== undefined) {
      if (
        !Number.isInteger(updates["day_of_month"]) ||
        (updates["day_of_month"] as number) < 1 ||
        (updates["day_of_month"] as number) > 28
      ) {
        return { ok: false, error: "db:updateRecurringRule: day_of_month must be an integer 1–28" };
      }
      validated["day_of_month"] = updates["day_of_month"];
    }
    if (updates["vendor"] !== undefined) {
      if (typeof updates["vendor"] !== "string" || (updates["vendor"] as string).trim() === "") {
        return { ok: false, error: "db:updateRecurringRule: vendor must be a non-empty string" };
      }
      validated["vendor"] = (updates["vendor"] as string).trim();
    }
    if (updates["category"] !== undefined) {
      if (!VALID_CATEGORIES.has(updates["category"] as string)) {
        return { ok: false, error: "db:updateRecurringRule: invalid category" };
      }
      validated["category"] = updates["category"];
    }
    if (updates["end_date"] !== undefined) {
      if (updates["end_date"] !== null && (typeof updates["end_date"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(updates["end_date"] as string))) {
        return { ok: false, error: "db:updateRecurringRule: end_date must be YYYY-MM-DD or null" };
      }
      validated["end_date"] = updates["end_date"];
    }
    if (updates["is_active"] !== undefined) {
      if (typeof updates["is_active"] !== "boolean") {
        return { ok: false, error: "db:updateRecurringRule: is_active must be a boolean" };
      }
      validated["is_active"] = updates["is_active"];
    }

    try {
      const changed = updateRecurringRule(db, id, validated);
      return changed ? { ok: true } : { ok: false, error: "Rule not found" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] db:updateRecurringRule failed", err);
      return { ok: false, error: message };
    }
  });

  // ------------------------------------------------------------------
  // db:deleteRecurringRule — P5
  // ------------------------------------------------------------------
  ipcMain.handle("db:deleteRecurringRule", (_event, id: number) => {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "db:deleteRecurringRule: id must be a positive integer" };
    }
    try {
      const changed = deleteRecurringRule(db, id);
      return changed ? { ok: true } : { ok: false, error: "Rule not found" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] db:deleteRecurringRule failed", err);
      return { ok: false, error: message };
    }
  });

  // ------------------------------------------------------------------
  // ingestion — P3 implementation
  // ------------------------------------------------------------------

  // Legacy stub (kept for back-compat with any existing callers)
  ipcMain.handle("ingestion:triggerPoll", async () => {
    return;
  });

  // Run all sources: recurring (current month) + any staged manual/dragdrop + email
  ipcMain.handle("ingestion:runSources", async () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    const recurringSource = new RecurringSource(db, currentMonth);

    // Create EmailSource lazily on first use; it reads IMAP config from settings at call time
    if (emailSource === null) {
      emailSource = new EmailSource(db, () => getImapConfig(db));
    }

    try {
      return await runSources(db, [recurringSource, manualSource, dragDropSource, emailSource]);
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
  // ingestion:getEmailStatus — P4: email connection status
  // ------------------------------------------------------------------
  ipcMain.handle("ingestion:getEmailStatus", () => {
    return getEmailStatus();
  });

  // ------------------------------------------------------------------
  // ingestion:getReviewQueue — P4: low/medium-confidence items
  // ------------------------------------------------------------------
  ipcMain.handle("ingestion:getReviewQueue", () => {
    return getReviewQueue();
  });

  // ------------------------------------------------------------------
  // ingestion:clearReviewItem — P4: dismiss or confirm a review item
  // ------------------------------------------------------------------
  ipcMain.handle("ingestion:clearReviewItem", (_event, id: string) => {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("ingestion:clearReviewItem: id must be a non-empty string");
    }
    return clearReviewItem(id);
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
    // Accept string, number, or plain object/array (serialized to JSON for settings table).
    // This allows storing the vendor_category_map as JSON.
    if (typeof value === "string") {
      setSetting(db, key, value);
    } else if (typeof value === "number") {
      setSetting(db, key, String(value));
    } else if (typeof value === "boolean") {
      setSetting(db, key, String(value));
    } else if (typeof value === "object" && value !== null) {
      setSetting(db, key, JSON.stringify(value));
    } else {
      throw new Error(`settings:set: unsupported value type: ${typeof value}`);
    }
  });

  // ------------------------------------------------------------------
  // backup — P6
  // ------------------------------------------------------------------

  ipcMain.handle("backup:getStatus", () => {
    return getBackupStatus();
  });

  ipcMain.handle("backup:triggerNow", () => {
    const backupFolder = getSetting(db, "backup_folder");
    if (!backupFolder) {
      return { ok: false, error: "Backup folder not configured in Settings." };
    }
    try {
      const today = dateString();
      copyToBackupFolder(DB_PATH, backupFolder, today);
      rotateOld(backupFolder);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
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

  // Daily backup on open — runs at most once per calendar day.
  // Silently skipped if backup_folder is not configured.
  try {
    dailyTrigger(buildBackupDeps(db, DB_PATH, getSetting, setSetting));
  } catch (err) {
    console.error("[main] dailyTrigger failed unexpectedly", err);
  }

  // Quit backup — synchronous copy before the process exits.
  app.on("before-quit", () => {
    try {
      quitBackup(buildBackupDeps(db, DB_PATH, getSetting, setSetting));
    } catch (err) {
      console.error("[main] quitBackup failed", err);
    }
  });

  try {
    createWindow();
  } catch (err) {
    console.error("[main] createWindow failed", err);
    app.quit();
    return;
  }

  // Run ingestion after the window is up so it does not delay window creation.
  // Best-effort; failure is captured in emailStatus (never throws).
  emailSource = new EmailSource(db, () => getImapConfig(db));
  const now2 = new Date();
  const currentMonth2 = `${now2.getFullYear()}-${(now2.getMonth() + 1).toString().padStart(2, "0")}`;
  const recurringSource2 = new RecurringSource(db, currentMonth2);
  runSources(db, [recurringSource2, manualSource, dragDropSource, emailSource]).catch((err) => {
    console.error("[main] startup ingestion run failed", err);
  });

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
