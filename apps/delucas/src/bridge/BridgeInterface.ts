/**
 * BridgeInterface — the complete typed contract between renderer and shell.
 *
 * This file contains only types/interfaces — no implementation, no imports
 * from electron or node:*. Both renderer and shell processes import from here.
 *
 * Renderer accesses the bridge via `window.bridge` (populated by preload.ts
 * in Electron, or mockBridge.ts in browser dev mode).
 */

export interface DialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface BridgeAPI {
  /** DB operations — implemented in P2 */
  db: {
    /**
     * SECURITY: the ipcMain handler for "db:query" MUST use parameterized
     * queries exclusively (e.g. db.prepare(sql).all(...params)).  It must
     * never pass the client-supplied `sql` string directly to SQLite without
     * an allowlist check — doing so would open a SQL injection vector.
     */
    query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
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
