import Link from "next/link";
import * as React from "react";

import { Reveal } from "@/components/reveal";
import { Cube } from "@/components/cube";

/**
 * The pieces every page in the design language is assembled from: the page
 * gutter, the blue eyebrow, the light display headline, the hairline rule that
 * draws itself in on scroll, the CTA band, and the quiet cube texture.
 *
 * Authored once here so a spacing or type-scale decision is made in one place
 * rather than re-derived per page.
 */

/** Page gutter: 72px at the artboard's 1440 width, tightening on small screens. */
export const GUTTER = "mx-auto w-full max-w-[90rem] px-6 lg:px-[4.5rem]";

/**
 * Wraps `phrase` in a semibold span inside `text`, without altering the string.
 * The artboards set one emphasised phrase per display headline; the copy in
 * `content.ts` is a single frozen string, so the split happens at render.
 * If the phrase isn't present the headline renders plain — never truncated.
 */
export function emphasize(text: string, phrase: string): React.ReactNode {
  const at = text.indexOf(phrase);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold text-primary">{phrase}</b>
      {text.slice(at + phrase.length)}
    </>
  );
}

/** Small caps-tracked Space Grotesk label in blue. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary ${className}`.trim()}
    >
      {children}
    </p>
  );
}

/**
 * A section-dividing hairline that draws itself in from the left on scroll.
 * Used where a plain `border-t` would be static — the rules that frame a
 * section heading, not every edge on the page.
 */
export function DrawnRule({ className = "" }: { className?: string }) {
  return (
    <Reveal
      variant="draw-rule"
      aria-hidden
      className={`h-px origin-left bg-border ${className}`.trim()}
    />
  );
}

/**
 * The standard subpage head: eyebrow, light display headline with one
 * emphasised phrase, supporting line. Staggered rise on load.
 */
export function PageHead({
  eyebrow,
  title,
  emphasis,
  description,
  size = "default",
}: {
  eyebrow: string;
  title: string;
  emphasis?: string;
  description: string;
  /** `oversized` is the page's one bold moment — use at most once per page. */
  size?: "default" | "oversized";
}) {
  return (
    <div className={`${GUTTER} flex flex-col items-start border-b border-border py-16 sm:py-20 lg:pb-16 lg:pt-[5.75rem]`}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal
        as="h1"
        delay={80}
        className={`mt-5 text-balance font-light leading-[1.06] tracking-[-0.025em] ${
          size === "oversized"
            ? "max-w-[20ch] text-[clamp(2.75rem,7.5vw,5.25rem)]"
            : "max-w-[22ch] text-[clamp(2.25rem,5vw,3.625rem)] lg:max-w-[18ch]"
        }`}
      >
        {emphasis ? emphasize(title, emphasis) : title}
      </Reveal>
      <Reveal as="p" delay={160} className="mt-5 max-w-xl text-[1.125rem] leading-relaxed text-muted-foreground">
        {description}
      </Reveal>
    </div>
  );
}

/**
 * Closing CTA. `tone="plate"` is the full-bleed #7EB3F7 version — a page's one
 * bold moment. `tone="quiet"` is the hairline row that floods blue on hover.
 * Copy comes from `contactSection`, verbatim.
 */
export function CtaBand({
  title,
  description,
  tone = "quiet",
}: {
  title: string;
  description: string;
  tone?: "quiet" | "plate";
}) {
  const plate = tone === "plate";
  return (
    <Link
      href="/#contact"
      className={`group block border-t border-border ${
        plate
          ? "bg-accent text-accent-foreground"
          : "flood-row border-b focus-visible:outline-none"
      }`}
    >
      <div className={`${GUTTER} grid items-center gap-8 py-14 sm:grid-cols-[1fr_3.75rem] sm:py-[3.5rem]`}>
        <div>
          <p
            className={`text-balance font-light tracking-[-0.02em] ${
              plate ? "text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05]" : "text-[clamp(1.75rem,3.4vw,2.5rem)]"
            }`}
          >
            {title}
          </p>
          <p
            className={`mt-2.5 max-w-3xl text-[0.9375rem] leading-relaxed ${
              plate ? "text-accent-foreground/85" : "text-muted-foreground group-hover:text-accent-foreground"
            }`}
          >
            {description}
          </p>
        </div>
        <span
          aria-hidden
          className={`hidden text-[1.75rem] transition-transform duration-[350ms] ease-out sm:block sm:justify-self-end ${
            plate ? "group-hover:translate-x-2" : "flood-arrow"
          }`}
        >
          &rarr;
        </span>
      </div>
    </Link>
  );
}

/**
 * Faint outline cubes as section-background texture. Decorative, never loud —
 * the motif recurring, not a pattern competing with the copy.
 */
export function CubeTexture({
  className = "",
  count = 3,
}: {
  className?: string;
  count?: number;
}) {
  // Hand-placed rather than tiled: three cubes at different scales read as the
  // mark echoed, a repeating tile reads as wallpaper.
  const spots = [
    "left-[-3%] top-[8%] w-[16rem]",
    "right-[4%] top-[42%] w-[9rem]",
    "left-[38%] bottom-[-6%] w-[12rem]",
  ];
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`.trim()}>
      {spots.slice(0, count).map((spot, i) => (
        <Cube
          key={i}
          filled={false}
          strokeWidth={0.7}
          className={`absolute text-border ${spot}`}
        />
      ))}
    </div>
  );
}

/** Cube-shaped list bullet — the motif at its smallest. */
export function CubeBullet({ className = "" }: { className?: string }) {
  return <Cube strokeWidth={2} className={`size-3.5 shrink-0 text-foreground/70 ${className}`.trim()} />;
}
