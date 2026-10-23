"use client";
/** @jsxRuntime automatic */
import { useFormStatus } from "react-dom";

/** Submit button that disables while the form's server action runs, so a double-click can't file two tickets. */
export function SendButton() {
  // Next's bundled React has useFormStatus; plain react-dom 18 (the node tests) does not, so render idle there.
  const pending = useFormStatus?.().pending ?? false; // ponytail: test-env guard — drop when tests run on the Next React
  return (
    <button type="submit" className="btn" disabled={pending} aria-disabled={pending}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}
