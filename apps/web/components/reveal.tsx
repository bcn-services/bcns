"use client";

import * as React from "react";

type RevealProps<T extends React.ElementType> = {
  /** Element/component to render as the reveal wrapper. Defaults to `div`. */
  as?: T;
  /** Entrance delay in ms — use to stagger a row of siblings. */
  delay?: number;
  children: React.ReactNode;
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
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      // Pre-reveal: invisible and nudged down; on reveal, fade-up animation runs
      // and lands the element at its natural position.
      className={`${shown ? "animate-fade-up" : "opacity-0"} ${className}`.trim()}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
