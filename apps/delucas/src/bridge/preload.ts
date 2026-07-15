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

const bridge: BridgeAPI = {
  db: {
    query: (sql: string, params?: unknown[]): Promise<unknown[]> =>
      ipcRenderer.invoke("db:query", sql, params),
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
