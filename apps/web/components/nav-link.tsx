"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Header link that marks the current page: blue text + aria-current="page". Sub-routes (/work/x) count as their section. */
export function NavLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`${className} ${current ? "!text-primary-ink" : ""}`}>
      {children}
    </Link>
  );
}
