"use client";

import { useEffect, useRef } from "react";
import { ownsKeys } from "@/lib/keys";

/**
 * Keyboard for Work and Today: j/k move through `rows` (keys), esc clears, enter calls onEnter,
 * any other key in `on` runs with the selection (or null). Typing targets keep their keys (ownsKeys).
 */
export function useRowKeys(
  rows: string[],
  sel: string | null,
  setSel: (k: string | null) => void,
  on: Record<string, (sel: string | null) => void>,
  onEnter?: () => void
) {
  const h = useRef({ rows, sel, on, onEnter });
  h.current = { rows, sel, on, onEnter };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ownsKeys(e.target as HTMLElement | null, e.key)) return;
      const { rows, sel, on, onEnter } = h.current;
      if (e.key === "j" || e.key === "k") {
        if (!rows.length) return;
        const i = sel ? rows.indexOf(sel) : -1;
        setSel(rows[e.key === "j" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)] ?? null);
      } else if (e.key === "Enter") {
        if (!sel) return;
        onEnter?.();
      } else if (e.key === "Escape") setSel(null);
      else {
        const fn = on[e.key];
        if (!fn) return;
        fn(sel);
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSel]);

  useEffect(() => {
    document.querySelector("[aria-current=true]")?.scrollIntoView({ block: "nearest" });
  }, [sel]);
}
