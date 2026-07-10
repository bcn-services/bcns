import * as React from "react";
import { cn } from "./lib/utils";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>;

/** Small pill used for eyebrow labels and status tags. */
function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
