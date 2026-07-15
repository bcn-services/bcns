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
    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
      <p className="text-2xl mb-2">🍕</p>
      <p className="text-base font-medium text-foreground">No data yet</p>
      <p className="text-sm text-muted-foreground mt-1">
        Add your first transaction in the{" "}
        <span className="font-medium text-foreground">Add &amp; fix</span> tab.
      </p>
    </div>
  );
}
