"use client";

import { useState } from "react";

/** The address stays on screen as plain, selectable text; the button is a convenience on top. */
export function CopyUrl({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="copyurl">
      <pre className="code">{url}</pre>
      <button type="button" className="btn btn-out btn-sm" onClick={copy} aria-label={state === "copied" ? "Copied the workspace address" : "Copy the workspace address"}>
        {state === "copied" ? "Copied" : "Copy address"}
      </button>
      <span role="status" className="tiny">
        {state === "failed" ? "Couldn't copy. Select the address and copy it yourself." : ""}
      </span>
    </div>
  );
}
