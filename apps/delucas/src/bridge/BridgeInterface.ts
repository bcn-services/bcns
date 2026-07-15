/**
 * BridgeInterface — the complete typed contract between renderer and shell.
 *
 * This file contains only types/interfaces — no implementation, no imports
 * from electron or node:*. Both renderer and shell processes import from here.
 *
 * Renderer accesses the bridge via `window.bridge` (populated by preload.ts
 * in Electron, or mockBridge.ts in browser dev mode).
 */

import type {
  Transaction,
  NewTransaction,
  RecurringRule,
  MonthPnl,
} from "../shared/types";

export type { Transaction, NewTransaction, RecurringRule, MonthPnl };

// ---------------------------------------------------------------------------
// Ingestion types exposed through the bridge
// (mirrors LLMExtractResult in shell-electron/ingestion/llm.ts — must be
//  importable by the renderer without any node:* deps)
// ---------------------------------------------------------------------------

export interface LLMExtractResultBridge {
  is_invoice: boolean;
  vendor: string | null;
  /** YYYY-MM-DD or null */
  date: string | null;
  /** Amount in cents (integer) or null */
  amount: number | null;
  confidence: "high" | "medium" | "low";
}

export interface IngestionRunReportBridge {
  found: number;
  imported: number;
  failed: number;
  ran_at: string;
}

// ---------------------------------------------------------------------------
// P4 — Email status + review queue types
// ---------------------------------------------------------------------------

export interface EmailStatusBridge {
  connected: boolean;
  lastChecked: string | null;
  error: string | null;
}

export interface ReviewItemBridge {
  id: string;
  queued_at: string;
  message_id: string;
  extraction: LLMExtractResultBridge;
}

export type VendorMapBridge = Record<string, string>;

export interface DialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface BridgeAPI {
  /** DB operations */
  db: {
    /**
     * Generic parameterized SELECT. Main process enforces SELECT-only.
     * SECURITY: parameterized via db.prepare().all(...params); never raw SQL concat.
     */
    query: (sql: string, params?: unknown[]) => Promise<unknown[]>;

    /** Typed read/write operations */
    getTransactions: () => Promise<Transaction[]>;
    getTransactionsByMonth: (month: string) => Promise<Transaction[]>;
    insertTransaction: (tx: NewTransaction) => Promise<number>;
    getMonthPnl: (month: string) => Promise<MonthPnl>;
    get12MonthSeries: (endMonth: string) => Promise<MonthPnl[]>;
    getSummary: (month: string) => Promise<string>;
    getRecurringRules: () => Promise<RecurringRule[]>;
    materializeRecurring: (throughMonth: string) => Promise<void>;
    isEmailProcessed: (messageId: string) => Promise<boolean>;
    markEmailProcessed: (messageId: string) => Promise<void>;
  };

  /** Ingestion — P3 + P4 */
  ingestion: {
    /** Legacy stub — kept for back-compat */
    triggerPoll: () => Promise<void>;
    /** Run all ingestion sources (recurring + any staged manual/dragdrop + email) */
    runSources: () => Promise<IngestionRunReportBridge>;
    /** Submit a manually entered transaction */
    submitManual: (tx: NewTransaction) => Promise<IngestionRunReportBridge>;
    /** Return the last run report (null if no run yet) */
    getLastRunReport: () => Promise<IngestionRunReportBridge | null>;
    /**
     * Process a PDF file: pdf→image→LLM extraction.
     * Returns the extracted invoice data or throws on failure.
     */
    processPdf: (filePath: string) => Promise<LLMExtractResultBridge>;
    /**
     * Confirm and save an extracted transaction.
     * `tx` is the user-edited version of what LLM extracted.
     */
    confirmImport: (tx: NewTransaction) => Promise<IngestionRunReportBridge>;
    /** P4 — Email connection status */
    getEmailStatus: () => Promise<EmailStatusBridge>;
    /** P4 — Low/medium-confidence items awaiting user review */
    getReviewQueue: () => Promise<ReviewItemBridge[]>;
    /** P4 — Dismiss or confirm a review item (removes it from the queue) */
    clearReviewItem: (id: string) => Promise<boolean>;
  };

  /** Native file dialogs */
  dialog: {
    openFile: (options?: DialogOptions) => Promise<string | null>;
    openDirectory: () => Promise<string | null>;
  };

  /** Persistent app settings — implemented in P6 */
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
}

/** Global augmentation so renderer can access the bridge via window.bridge */
declare global {
  interface Window {
    bridge: BridgeAPI;
  }
}
