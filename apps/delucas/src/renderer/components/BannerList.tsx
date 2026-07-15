/**
 * BannerList — renders active failure banners (email/LLM status).
 * Each banner is dismissible but returns while the underlying issue persists.
 *
 * Accepts EmailStatusBridge; if error is non-null and the banner hasn't been
 * dismissed in this render cycle, it shows. If the error clears, the banner
 * auto-hides on the next poll.
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useState, useEffect } from "react";
import type { EmailStatusBridge } from "../../bridge/BridgeInterface";

interface BannerListProps {
  emailStatus: EmailStatusBridge | null;
}

export function BannerList({ emailStatus }: BannerListProps): React.JSX.Element | null {
  // Track which error strings have been dismissed in this session.
  // When the error text changes (different error) or clears and comes back,
  // the banner re-appears.
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const currentError = emailStatus?.error ?? null;

  // When the error changes (new error or cleared), reset the dismissed state.
  // dismissedError is intentionally excluded from the dep array — the effect
  // only needs to run when the error string itself changes, not when the user
  // dismisses (which would cause an unnecessary re-run after every dismiss).
  useEffect(() => {
    setDismissedError(null);
  }, [currentError]);

  if (currentError === null || currentError === dismissedError) return null;

  return (
    <div className="space-y-2" role="alert" aria-live="assertive">
      <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
        <span className="text-destructive">
          <span className="font-semibold">Email check failed:</span>{" "}
          {currentError}
        </span>
        <button
          type="button"
          onClick={() => setDismissedError(currentError)}
          className="shrink-0 text-destructive/60 hover:text-destructive transition-colors text-xs underline"
          aria-label="Dismiss email error banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
