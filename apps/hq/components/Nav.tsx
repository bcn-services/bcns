"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Today"],
  ["/leads", "Leads"],
  ["/work", "Work"],
  ["/clients", "Clients"],
  ["/numbers", "Numbers"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Views">
      {LINKS.map(([href, label]) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`nv${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
