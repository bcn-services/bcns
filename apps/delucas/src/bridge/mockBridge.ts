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

export const mockBridge: BridgeAPI = {
  db: {
    query: async (_sql: string, _params?: unknown[]): Promise<unknown[]> => {
      console.warn("[mockBridge] db.query called — returning empty result");
      return [];
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
