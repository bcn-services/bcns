/**
 * EmailStatusBanner — shows a plain-English error banner when email
 * ingestion fails to connect. Hidden when email is connected or unconfigured.
 *
 * Renderer only — no node:* or electron imports.
 */

"use client";

import React, { useEffect, useState } from "react";
import type { EmailStatusBridge } from "../../bridge/BridgeInterface";

export function EmailStatusBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<EmailStatusBridge | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus(): Promise<void> {
      try {
        const s = await window.bridge.ingestion.getEmailStatus();
        if (!cancelled) setStatus(s);
      } catch {
        // Bridge not available (browser dev mode) — ignore
      }
    }

    void fetchStatus();

    // Poll every 30 seconds so the banner clears when connection recovers
    const id = setInterval(() => { void fetchStatus(); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (status === null || status.error === null) return null;

  return (
    <div
      role="alert"
      className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm flex items-start gap-2"
    >
      <span className="font-semibold shrink-0">Email check failed:</span>
      <span>{status.error}</span>
    </div>
  );
}
