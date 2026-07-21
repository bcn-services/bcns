import * as React from "react";
import { cn } from "./lib/utils";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  /**
   * Opt-in: a single word/phrase within `title` to render as a serif-italic
   * accent (the "uniquely Nate" landing move — one accent word only). Must be a
   * substring of `title`; the first occurrence is styled, the rest is unchanged.
   */
  accent?: string;
  /** `display` bumps to bold hero-headline sizes; `default` is unchanged. */
  size?: "default" | "display";
}

/** Splits `title` around the first occurrence of `accent`, styling only that segment. */
function renderTitle(title: string, accent?: string) {
  if (!accent) return title;
  const index = title.indexOf(accent);
  if (index === -1) return title;
  const before = title.slice(0, index);
  const after = title.slice(index + accent.length);
  return (
    <>
      {before}
      <span className="font-serif-accent font-normal italic text-primary">{accent}</span>
      {after}
    </>
  );
}

/** Reusable section title block: optional eyebrow, heading, and lead text. */
function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
  accent,
  size = "default",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl text-left",
        className
      )}
    >
      {eyebrow ? (
        <span className="text-sm font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </span>
      ) : null}
      <h2
        className={cn(
          "font-display text-balance font-bold tracking-tight",
          size === "display"
            ? "text-4xl sm:text-5xl md:text-6xl"
            : "text-3xl sm:text-4xl"
        )}
      >
        {renderTitle(title, accent)}
      </h2>
      {description ? (
        <p className="text-pretty text-lg text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export { SectionHeading };
