import Link from "next/link";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/cube";
import { GUTTER } from "@/components/kit";
import { siteConfig } from "@/lib/site";
import { siteContent } from "@/lib/content";

export function SiteHeader() {
  const cta = siteContent.hero.ctaPrimary;
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className={`${GUTTER} flex h-[4.5rem] items-center justify-between gap-4`}>
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-sm font-display text-[1.0625rem] font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <LogoMark className="size-8 transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span>{siteConfig.name}</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4 lg:gap-9">
          <nav aria-label="Primary" className="hidden items-center gap-9 md:flex">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <ThemeToggle />

          {/* Native disclosure: the nav is four links, so a JS drawer would buy
              nothing and would cost this header its server-component status. */}
          <details className="group relative md:hidden [&_summary::-webkit-details-marker]:hidden">
            <summary
              aria-label="Menu"
              className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu aria-hidden className="size-5" />
            </summary>
            <nav
              aria-label="Primary"
              className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-card p-2 shadow-[0_12px_44px_hsl(220_13%_9%/0.08)]"
            >
              {siteConfig.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/#contact"
                className="lift-button mt-1 block rounded-lg bg-foreground px-5 py-2.5 text-center text-sm font-medium text-background"
              >
                {cta}
              </Link>
            </nav>
          </details>

          {/* The header CTA is ink, not blue — the blue button belongs to the
              hero and the form, so the page has one primary action at a time. */}
          <Link
            href="/#contact"
            className="lift-button hidden rounded-lg bg-foreground px-[1.375rem] py-[0.6875rem] text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-block"
          >
            {cta}
          </Link>
        </div>
      </div>
    </header>
  );
}
