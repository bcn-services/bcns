import Link from "next/link";
import { Menu } from "lucide-react";
import { buttonVariants } from "@nseluga/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/cube";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between gap-4 px-6 lg:px-12">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-sm font-display text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <LogoMark className="h-6 w-[1.83rem] transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span>{siteConfig.name}</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative rounded-sm py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
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
              className="absolute right-0 top-11 w-52 rounded-xl border border-border bg-card p-2 shadow-lg"
            >
              {siteConfig.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-primary/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/#contact"
                className={buttonVariants({ size: "sm", className: "mt-1 w-full" })}
              >
                Book a free consult
              </Link>
            </nav>
          </details>
          <Link
            href="/#contact"
            className={buttonVariants({ size: "sm", className: "hidden sm:inline-flex" })}
          >
            Book a free consult
          </Link>
        </div>
      </div>
    </header>
  );
}
