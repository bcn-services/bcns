import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Standalone Vite config for renderer-only browser dev mode.
 * Runs at http://localhost:3001 to avoid conflict with apps/web on :3000.
 * Uses mockBridge to stand in for the Electron contextBridge.
 */
export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  server: {
    port: 3001,
  },
  resolve: {
    alias: {
      // Resolve @bcns/ui source-level exports (no build step on the package)
      "@bcns/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
  },
});
