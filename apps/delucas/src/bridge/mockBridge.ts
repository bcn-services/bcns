/**
 * mockBridge — browser-safe stub of BridgeAPI for pnpm dev (no Electron).
 *
 * Installed on window.bridge before React mounts. All methods return sensible
 * no-ops or empty results so the renderer can render without a real shell.
 *
 * IMPORTANT: This file must not import from electron or node:* — it runs in a
 * plain browser context.
 */

import type { BridgeAPI, DialogOptions } from "./BridgeInterface";
import type { NewTransaction, MonthPnl } from "../shared/types";

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
};
