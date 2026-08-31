import Link from "next/link";
import { LogoMark } from "@/components/cube";
import { GUTTER } from "@/components/kit";
import { siteConfig } from "@/lib/site";

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "/#contact" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div
        className={`${GUTTER} flex flex-col items-center justify-between gap-5 py-7 font-display text-[0.8125rem] text-muted-foreground sm:flex-row`}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-sm font-bold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <LogoMark className="size-[1.35rem]" />
            {siteConfig.name}
          </Link>
          <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
          <p>
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
          {[...siteConfig.nav, ...legalLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
