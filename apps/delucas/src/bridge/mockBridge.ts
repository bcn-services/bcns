/**
 * mockBridge — browser-safe stub of BridgeAPI for pnpm dev (no Electron).
 *
 * Installed on window.bridge before React mounts. All methods return sensible
 * no-ops or empty results so the renderer can render without a real shell.
 *
 * IMPORTANT: This file must not import from electron or node:* — it runs in a
 * plain browser context.
 */

import type {
  BridgeAPI,
  DialogOptions,
  IngestionRunReportBridge,
  LLMExtractResultBridge,
  EmailStatusBridge,
  ReviewItemBridge,
  MutationResult,
  TransactionUpdatesInput,
  RecurringRuleUpdates,
} from "./BridgeInterface";
import type { NewTransaction, MonthPnl, RecurringRule } from "../shared/types";

const EMPTY_PNL: MonthPnl = {
  month: "",
  revenue_cents: 0,
  expense_cents: 0,
  profit_cents: 0,
  expense_by_category: {
    food: 0,
    beverage: 0,
    utilities: 0,
    rent: 0,
    labor: 0,
    other: 0,
  },
};

export const mockBridge: BridgeAPI = {
  db: {
    query: async (_sql: string, _params?: unknown[]): Promise<unknown[]> => {
      console.warn("[mockBridge] db.query called — returning empty result");
      return [];
    },

    getTransactions: async () => {
      console.warn("[mockBridge] db.getTransactions — returning []");
      return [];
    },

    getTransactionsByMonth: async (_month: string) => {
      console.warn("[mockBridge] db.getTransactionsByMonth — returning []");
      return [];
    },

    insertTransaction: async (_tx: NewTransaction): Promise<number> => {
      console.warn("[mockBridge] db.insertTransaction — no-op");
      return 0;
    },

    getTransactionsForMonth: async (_month: string) => {
      console.warn("[mockBridge] db.getTransactionsForMonth — returning []");
      return [];
    },

    updateTransaction: async (_id: number, _updates: TransactionUpdatesInput): Promise<MutationResult> => {
      console.warn("[mockBridge] db.updateTransaction — no-op");
      return { ok: true };
    },

    deleteTransaction: async (_id: number): Promise<MutationResult> => {
      console.warn("[mockBridge] db.deleteTransaction — no-op");
      return { ok: true };
    },

    getMonthPnl: async (_month: string): Promise<MonthPnl> => {
      console.warn("[mockBridge] db.getMonthPnl — returning empty P&L");
      return { ...EMPTY_PNL };
    },

    get12MonthSeries: async (_endMonth: string): Promise<MonthPnl[]> => {
      console.warn("[mockBridge] db.get12MonthSeries — returning []");
      return [];
    },

    getSummary: async (_month: string): Promise<string> => {
      console.warn("[mockBridge] db.getSummary — returning empty string");
      return "";
    },

    getRecurringRules: async () => {
      console.warn("[mockBridge] db.getRecurringRules — returning []");
      return [];
    },

    insertRecurringRule: async (_rule: Omit<RecurringRule, "id">): Promise<MutationResult & { id?: number }> => {
      console.warn("[mockBridge] db.insertRecurringRule — no-op");
      return { ok: true, id: 0 };
    },

    updateRecurringRule: async (_id: number, _updates: RecurringRuleUpdates): Promise<MutationResult> => {
      console.warn("[mockBridge] db.updateRecurringRule — no-op");
      return { ok: true };
    },

    deleteRecurringRule: async (_id: number): Promise<MutationResult> => {
      console.warn("[mockBridge] db.deleteRecurringRule — no-op");
      return { ok: true };
    },

    materializeRecurring: async (_throughMonth: string): Promise<void> => {
      console.warn("[mockBridge] db.materializeRecurring — no-op");
    },

    isEmailProcessed: async (_messageId: string): Promise<boolean> => {
      console.warn("[mockBridge] db.isEmailProcessed — returning false");
      return false;
    },

    markEmailProcessed: async (_messageId: string): Promise<void> => {
      console.warn("[mockBridge] db.markEmailProcessed — no-op");
    },
  },

  ingestion: {
    triggerPoll: async (): Promise<void> => {
      console.warn("[mockBridge] ingestion.triggerPoll called — no-op in browser mode");
    },

    runSources: async (): Promise<IngestionRunReportBridge> => {
      console.warn("[mockBridge] ingestion.runSources — returning empty report");
      return { found: 0, imported: 0, failed: 0, ran_at: new Date().toISOString() };
    },

    submitManual: async (_tx: NewTransaction): Promise<IngestionRunReportBridge> => {
      console.warn("[mockBridge] ingestion.submitManual — no-op in browser mode");
      return { found: 1, imported: 1, failed: 0, ran_at: new Date().toISOString() };
    },

    getLastRunReport: async (): Promise<IngestionRunReportBridge | null> => {
      console.warn("[mockBridge] ingestion.getLastRunReport — returning null");
      return null;
    },

    processPdf: async (_filePath: string): Promise<LLMExtractResultBridge> => {
      console.warn("[mockBridge] ingestion.processPdf — returning mock extract result");
      return {
        is_invoice: true,
        vendor: "Mock Vendor Co.",
        date: new Date().toISOString().slice(0, 10),
        amount: 5000,
        confidence: "high",
      };
    },

    confirmImport: async (_tx: NewTransaction): Promise<IngestionRunReportBridge> => {
      console.warn("[mockBridge] ingestion.confirmImport — no-op in browser mode");
      return { found: 1, imported: 1, failed: 0, ran_at: new Date().toISOString() };
    },

    getEmailStatus: async (): Promise<EmailStatusBridge> => {
      console.warn("[mockBridge] ingestion.getEmailStatus — returning disconnected");
      return { connected: false, lastChecked: null, error: null };
    },

    getReviewQueue: async (): Promise<ReviewItemBridge[]> => {
      console.warn("[mockBridge] ingestion.getReviewQueue — returning []");
      return [];
    },

    clearReviewItem: async (_id: string): Promise<boolean> => {
      console.warn("[mockBridge] ingestion.clearReviewItem — no-op in browser mode");
      return false;
    },
  },

  dialog: {
    openFile: async (_options?: DialogOptions): Promise<string | null> => {
      console.warn("[mockBridge] dialog.openFile called — returning null in browser mode");
      return null;
    },
    openDirectory: async (): Promise<string | null> => {
      console.warn("[mockBridge] dialog.openDirectory called — returning null in browser mode");
      return null;
    },
  },

  settings: {
    get: async (_key: string): Promise<unknown> => {
      console.warn("[mockBridge] settings.get called — returning undefined in browser mode");
      return undefined;
    },
    set: async (_key: string, _value: unknown): Promise<void> => {
      console.warn("[mockBridge] settings.set called — no-op in browser mode");
    },
  },

  backup: {
    getStatus: async (): Promise<{ lastBackup: string | null; error: string | null }> => {
      console.warn("[mockBridge] backup.getStatus — returning null status in browser mode");
      return { lastBackup: null, error: null };
    },
    triggerNow: async (): Promise<{ ok: boolean; error?: string }> => {
      console.warn("[mockBridge] backup.triggerNow — no-op in browser mode");
      return { ok: true };
    },
  },
};
