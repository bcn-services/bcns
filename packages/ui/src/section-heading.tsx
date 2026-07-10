import * as React from "react";
import { cn } from "./lib/utils";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

/** Reusable section title block: optional eyebrow, heading, and lead text. */
function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
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
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description ? (
        <p className="text-pretty text-lg text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export { SectionHeading };
