"use client";

/**
 * Mounted once in app/layout.tsx. Every popup in the app is a native
 * <details className="popup">; this closes them on outside click and Escape
 * (rule in lib/popup-dismiss.ts). Renders nothing.
 */

import { useEffect } from "react";
import { OPEN_POPUPS, popupsToClose } from "@/lib/popup-dismiss";

export function PopupDismiss() {
  useEffect(() => {
    const dismiss = (event: Event) => {
      const open = Array.from(document.querySelectorAll<HTMLDetailsElement>(OPEN_POPUPS));
      const key = event instanceof KeyboardEvent ? event.key : undefined;
      for (const popup of popupsToClose(open, { type: event.type, key, target: event.target })) popup.open = false;
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);
  return null;
}
