/** @jsxRuntime automatic */
"use client";

/**
 * A hub nav link that marks itself aria-current="page" on its own section.
 * Client-only because the layout (a server component) has no pathname. Sources
 * also owns /sources/<s>. Outside the app router (tests) usePathname is null and
 * nothing is marked.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path !== null && (href === "/" ? path === "/" || path.startsWith("/sources/") : path === href || path.startsWith(`${href}/`));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
