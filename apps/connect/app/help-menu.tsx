"use client";
/** @jsxRuntime automatic */
/**
 * help-menu.tsx — the "?" in the header. One small popup, not a nav item: "Get help" opens /support,
 * "Connection guide" opens /guide. A <details>, like every other popup in the hub (globals.css .pop),
 * and a click on a link inside closes it (the layout, and so this menu, survives client-side navigation). The jsxRuntime pragma is for tests/help-menu.test.mjs, as in nav.tsx.
 */
import Link from "next/link";

export function HelpMenu() {
  return (
    <details className="pop pop-r hmenu">
      <summary aria-label="Help">?</summary>
      <div className="pop-b" onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>
        <Link href="/support">Get help</Link>
        <Link href="/guide">Connection guide</Link>
      </div>
    </details>
  );
}
