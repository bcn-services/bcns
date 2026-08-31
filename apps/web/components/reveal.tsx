"use client";

import * as React from "react";

/** Entrance animation variants — map to keyframes in the Tailwind preset. */
type RevealVariant = "fade-up" | "pop" | "fade-right" | "fade-left" | "draw-rule";

const VARIANT_CLASS: Record<RevealVariant, string> = {
  "fade-up": "animate-fade-up",
  pop: "animate-pop",
  "fade-right": "animate-fade-right",
  "fade-left": "animate-fade-left",
  "draw-rule": "animate-draw-rule",
};

/** Pre-reveal resting state. A rule collapses along its own axis, not to zero opacity. */
const HIDDEN_CLASS: Record<RevealVariant, string> = {
  "fade-up": "opacity-0",
  pop: "opacity-0",
  "fade-right": "opacity-0",
  "fade-left": "opacity-0",
  "draw-rule": "scale-x-0",
};

type RevealProps<T extends React.ElementType> = {
  /** Element/component to render as the reveal wrapper. Defaults to `div`. */
  as?: T;
  /** Entrance delay in ms — use to stagger a row of siblings. */
  delay?: number;
  /** Entrance animation. Defaults to `fade-up`; `pop` for springy focal reveals. */
  variant?: RevealVariant;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Scroll-reveal wrapper. A single IntersectionObserver adds `animate-fade-up`
 * when the element enters the viewport, then unobserves (one-shot). Powers both
 * scroll-reveal and staggered entrance (via `delay`) across the site.
 *
 * Under `prefers-reduced-motion`, the observer is skipped and the final state is
 * rendered immediately — no animation, no hidden content.
 */
export function Reveal<T extends React.ElementType = "div">({
  as,
  delay = 0,
  variant = "fade-up",
  children,
  className = "",
  ...rest
}: RevealProps<T> & Omit<React.ComponentPropsWithoutRef<T>, keyof RevealProps<T>>) {
  const Tag = (as ?? "div") as React.ElementType;
  const ref = React.useRef<HTMLElement | null>(null);
  // Start hidden only when we know JS + motion are available; otherwise render
  // final state so no-JS and reduced-motion users never see blank content.
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.unobserve(entry.target);
          }
        }
      },
      // threshold 0, not a fraction: an element taller than the viewport can
      // never show 15% of itself, so a fractional threshold leaves the tallest
      // sections (pricing tiers, case-study bodies, the consult steps on a
      // phone) stuck at opacity-0 forever. Any pixel entering is enough.
      { threshold: 0, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      // Marks the element for the no-JS override in app/layout.tsx: without JS
      // the observer never runs, so the hidden state would be permanent.
      data-reveal=""
      // Pre-reveal: invisible and nudged down; on reveal, fade-up animation runs
      // and lands the element at its natural position.
      className={`${shown ? VARIANT_CLASS[variant] : HIDDEN_CLASS[variant]} ${className}`.trim()}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
