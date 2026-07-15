/**
 * preload.ts — Electron contextBridge implementation.
 *
 * Runs in the renderer context with Node/Electron access (contextIsolation: true).
 * Exposes BridgeAPI on window.bridge so the renderer can call shell capabilities
 * without importing from electron or node:* directly.
 *
 * Each method forwards to the main process via ipcRenderer.invoke().
 */

import { contextBridge, ipcRenderer } from "electron";
import type { BridgeAPI, DialogOptions } from "./BridgeInterface";
import type { NewTransaction } from "../shared/types";

const bridge: BridgeAPI = {
  db: {
    query: (sql: string, params?: unknown[]): Promise<unknown[]> =>
      ipcRenderer.invoke("db:query", sql, params),

    getTransactions: (): Promise<import("../shared/types").Transaction[]> =>
      ipcRenderer.invoke("db:getTransactions"),

    getTransactionsByMonth: (month: string): Promise<import("../shared/types").Transaction[]> =>
      ipcRenderer.invoke("db:getTransactionsByMonth", month),

    insertTransaction: (tx: NewTransaction): Promise<number> =>
      ipcRenderer.invoke("db:insertTransaction", tx),

    getMonthPnl: (month: string): Promise<import("../shared/types").MonthPnl> =>
      ipcRenderer.invoke("db:getMonthPnl", month),

    get12MonthSeries: (endMonth: string): Promise<import("../shared/types").MonthPnl[]> =>
      ipcRenderer.invoke("db:get12MonthSeries", endMonth),

    getSummary: (month: string): Promise<string> =>
      ipcRenderer.invoke("db:getSummary", month),

    getRecurringRules: (): Promise<import("../shared/types").RecurringRule[]> =>
      ipcRenderer.invoke("db:getRecurringRules"),

    materializeRecurring: (throughMonth: string): Promise<void> =>
      ipcRenderer.invoke("db:materializeRecurring", throughMonth),

    isEmailProcessed: (messageId: string): Promise<boolean> =>
      ipcRenderer.invoke("db:isEmailProcessed", messageId),

    markEmailProcessed: (messageId: string): Promise<void> =>
      ipcRenderer.invoke("db:markEmailProcessed", messageId),
  },

  ingestion: {
    triggerPoll: (): Promise<void> => ipcRenderer.invoke("ingestion:triggerPoll"),
  },

  dialog: {
    openFile: (options?: DialogOptions): Promise<string | null> =>
      ipcRenderer.invoke("dialog:openFile", options),
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:openDirectory"),
  },

  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke("settings:get", key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke("settings:set", key, value),
  },
};

contextBridge.exposeInMainWorld("bridge", bridge);
