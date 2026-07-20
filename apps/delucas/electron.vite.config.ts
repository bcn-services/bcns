import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * electron-vite config: bundles main process (CJS) + renderer (ESM/browser).
 * Used by `pnpm dev:electron` and `pnpm build`.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "src/shell-electron/main.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "src/bridge/preload.ts"),
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    resolve: {
      alias: {
        "@nseluga/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      },
    },
    build: {
      outDir: "dist/renderer",
    },
  },
});
