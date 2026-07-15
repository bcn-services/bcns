/**
 * Renderer entry point.
 *
 * In browser dev mode (pnpm dev), installs mockBridge on window.bridge before
 * mounting React so the app has a valid bridge regardless of environment.
 * In Electron, preload.ts has already populated window.bridge via contextBridge.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { mockBridge } from "../bridge/mockBridge";
import App from "./App";
import "./index.css";

// Install mock bridge when running in a plain browser (no contextBridge present)
if (typeof window !== "undefined" && window.bridge == null) {
  window.bridge = mockBridge;
}

const rootElement = document.getElementById("root");
if (rootElement == null) {
  throw new Error("Root element #root not found in DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
