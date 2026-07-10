import * as React from "react";
import { cn } from "./lib/utils";

/** Centered max-width wrapper with responsive horizontal padding. */
const Container = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mx-auto w-full max-w-6xl px-6 lg:px-8", className)}
      {...props}
    />
  )
);
Container.displayName = "Container";

export { Container };
