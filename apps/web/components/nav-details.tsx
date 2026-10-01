"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/** Native <details> menu that closes itself after a client-side route change. */
export function NavDetails({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  React.useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
