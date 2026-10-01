"use client";

import { useEffect, useState, type RefObject } from "react";

export interface InViewOptions {
  threshold?: number;
  rootMargin?: string;
  /** stay true after the first intersection (play-on-view). Default false (tracks live, pause-off-screen). */
  once?: boolean;
  /** pass false to skip observing (returns false) */
  enabled?: boolean;
}

/**
 * IntersectionObserver as state. False during SSR and before the first callback;
 * true immediately where IntersectionObserver is unavailable.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { threshold = 0, rootMargin = "0px", once = false, enabled = true }: InViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        if (last.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, rootMargin, once, enabled]);
  return inView;
}
