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
    <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <span className="text-destructive">
        <span className="font-semibold">{label}</span>{" "}
        {message}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-destructive/60 hover:text-destructive transition-colors text-xs underline"
        aria-label={`Dismiss ${label} banner`}
      >
        Dismiss
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
