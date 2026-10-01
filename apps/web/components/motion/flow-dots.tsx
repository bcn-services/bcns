"use client";

import { useEffect, useRef } from "react";
import { useInView } from "./use-in-view";
import { useReducedMotion } from "./use-media-query";

export interface FlowDotsProps {
  /** SVG path data the dots travel along (drawn as a faint line unless showPath is false) */
  d: string;
  /** any CSS colour, e.g. "hsl(var(--tool-shopify))" */
  color: string;
  n?: number;
  r?: number;
  /** seconds per lap */
  period?: number;
  showPath?: boolean;
  strokeOpacity?: number;
  strokeWidth?: number;
}

/**
 * Dots looping along a path. Render INSIDE an <svg>. rAF-driven, paused while the
 * graphic is off-screen (IntersectionObserver; rAF also stops in hidden tabs),
 * a single static frame under prefers-reduced-motion.
 */
export function FlowDots({
  d, color, n = 6, r = 3, period = 3.6, showPath = true, strokeOpacity = 0.45, strokeWidth = 1.5,
}: FlowDotsProps) {
  const gRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const reduced = useReducedMotion();
  const visible = useInView(gRef, { rootMargin: "80px" });

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const place = (t: number) => {
      let len = 0;
      try { len = path.getTotalLength(); } catch { len = 0; }
      if (!len) return;
      dotRefs.current.forEach((c, k) => {
        if (!c) return;
        const u = (t / period + k / n) % 1;
        const pt = path.getPointAtLength(u * len);
        c.setAttribute("cx", pt.x.toFixed(2));
        c.setAttribute("cy", pt.y.toFixed(2));
        c.setAttribute("opacity", (Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.14)).toFixed(3));
      });
    };
    if (reduced) { place(period * 0.3); return; }
    if (!visible) return;
    let raf = 0;
    const loop = (now: number) => { place(now / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [d, n, period, reduced, visible]);

  return (
    <g ref={gRef}>
      <path
        ref={pathRef} d={d} fill="none" stroke={color} strokeOpacity={showPath ? strokeOpacity : 0}
        strokeWidth={strokeWidth} strokeLinecap="round"
      />
      {Array.from({ length: n }, (_, k) => (
        <circle key={k} ref={(el) => { dotRefs.current[k] = el; }} r={r} fill={color} opacity={0} />
      ))}
    </g>
  );
}
