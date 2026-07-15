/**
 * EmptyState — shown on Dashboard when the DB has no transactions yet.
 *
 * Friendly placeholder so the first-run experience is not a blank screen
 * or zeros that look like real data.
 *
 * Renderer only — no node:* or electron imports.
 */

import React from "react";

export function EmptyState(): React.JSX.Element {
  return (
    <div className="rounded-xl bg-card border border-border shadow-sm px-8 py-12 flex flex-col items-center text-center gap-3">
      {/* Pizza slice — sized generously so it reads as a focal point */}
      <span className="text-5xl select-none" role="img" aria-label="pizza">🍕</span>

      <div className="space-y-1 mt-1">
        <p className="text-xl font-bold text-foreground">Nothing here yet</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          Add your first transaction in the{" "}
          <span className="font-semibold text-foreground">Add &amp; fix</span>{" "}
          tab — it only takes a few seconds.
        </p>
      </div>

      {/* Subtle directional cue — arrow pointing toward the tab */}
      <p className="text-xs text-primary font-medium mt-1 tracking-wide uppercase">
        Add &amp; fix →
      </p>
    </div>
  );
}
