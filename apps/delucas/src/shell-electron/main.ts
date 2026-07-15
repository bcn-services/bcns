/**
 * main.ts — Electron main process.
 *
 * Creates the BrowserWindow, loads the renderer, and registers ipcMain
 * handlers that back each method in BridgeAPI.
 *
 * Phase-specific implementations (db, ingestion) are stubs returning safe
 * defaults until P2–P6 land. File dialogs are fully implemented here.
 */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";

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

function registerIpcHandlers(): void {
  // db — stub (implemented in P2)
  ipcMain.handle("db:query", async (_event, _sql: string, _params?: unknown[]) => {
    return [];
  });

  // ingestion — stub (implemented in P3/P4)
  ipcMain.handle("ingestion:triggerPoll", async () => {
    return;
  });

  // dialog — fully implemented
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

  // settings — stub (implemented in P6)
  ipcMain.handle("settings:get", async (_event, _key: string) => {
    return undefined;
  });

  ipcMain.handle("settings:set", async (_event, _key: string, _value: unknown) => {
    return;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpcHandlers();
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
