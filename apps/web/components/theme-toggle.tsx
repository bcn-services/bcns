"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch: only render the resolved icon after mount.
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[0.625rem] border border-input bg-transparent text-foreground transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]"
    >
      {mounted ? (
        isDark ? (
          <Sun aria-hidden />
        ) : (
          <Moon aria-hidden />
        )
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}
