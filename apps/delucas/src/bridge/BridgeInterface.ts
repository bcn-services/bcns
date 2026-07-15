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

  /** Email ingestion — implemented in P3/P4 */
  ingestion: {
    triggerPoll: () => Promise<void>;
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
