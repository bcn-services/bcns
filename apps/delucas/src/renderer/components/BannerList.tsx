/**
 * BannerList — renders active failure banners (email error, backup error).
 * Each banner is dismissible but returns while the underlying issue persists.
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useState, useEffect } from "react";
import type { EmailStatusBridge } from "../../bridge/BridgeInterface";

interface BannerListProps {
  emailStatus: EmailStatusBridge | null;
  backupError?: string | null;
}

interface SingleBannerProps {
  label: string;
  message: string;
}

function SingleBanner({ label, message }: SingleBannerProps): React.JSX.Element {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false); }, [message]);
  if (dismissed) return <></>;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Warning icon */}
        <span className="mt-0.5 text-red-500 shrink-0" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 5a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 6zm0 6.5a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
          </svg>
        </span>
        <span className="text-sm text-red-800">
          <span className="font-semibold">{label}</span>{" "}
          {message}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-red-400 hover:text-red-600 transition-colors text-sm font-medium"
        aria-label={`Dismiss ${label} banner`}
      >
        ✕
      </button>
    </div>
  );
}

export function BannerList({ emailStatus, backupError }: BannerListProps): React.JSX.Element | null {
  const emailError = emailStatus?.error ?? null;
  const hasAnyBanner = emailError !== null || (backupError != null && backupError !== "");
  if (!hasAnyBanner) return null;

  return (
    <div className="space-y-2" role="alert" aria-live="assertive">
      {emailError !== null && (
        <SingleBanner label="Email check failed:" message={emailError} />
      )}
      {backupError != null && backupError !== "" && (
        <SingleBanner label="Backup failed:" message={backupError} />
      )}
    </div>
  );
}
