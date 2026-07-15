/**
 * CheckNowButton — triggers ingestion:runSources from the renderer.
 * Shows a loading state while the run is in progress.
 *
 * Renderer only — no node:* or electron imports.
 */

"use client";

import React, { useState } from "react";

interface CheckNowButtonProps {
  onComplete?: () => void;
}

export function CheckNowButton({ onComplete }: CheckNowButtonProps): React.JSX.Element {
  const [running, setRunning] = useState(false);

  async function handleClick(): Promise<void> {
    if (running) return;
    setRunning(true);
    try {
      await window.bridge.ingestion.runSources();
      onComplete?.();
    } catch (err) {
      console.error("[CheckNowButton] runSources failed", err);
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      disabled={running}
      onClick={() => { void handleClick(); }}
      className={[
        "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-colors",
      ].join(" ")}
    >
      {running ? "Checking…" : "Check now"}
    </button>
  );
}
