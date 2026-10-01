"use client";

import { useEffect, useState, type RefObject } from "react";

export interface Size { width: number; height: number }

/** Rounded content-box size of an element via ResizeObserver; {0,0} until measured (and on the server). */
export function useElementSize(ref: RefObject<Element | null>, enabled = true): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const read = () => {
      const width = Math.round(el.clientWidth);
      const height = Math.round(el.clientHeight);
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return size;
}
