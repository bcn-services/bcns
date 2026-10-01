import Link from "next/link";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ServicesMenu } from "@/components/services-menu";
import { NavDetails } from "@/components/nav-details";
import { LogoMark } from "@/components/cube";
import { GUTTER } from "@/components/kit";
import { siteConfig } from "@/lib/site";
import { siteContent } from "@/lib/content";

const NAV_LINK =
  "rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MOBILE_LINK =
  "block rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const SIGN_IN =
  "lift-button rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-secondary hover:shadow-none hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const FILLED =
  "lift-button rounded-lg bg-primary-ink px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteHeader() {
  const cta = siteContent.hero.ctaPrimary;
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className={`${GUTTER} flex h-16 items-center gap-3`}>
        <Link
          href="/"
          className="group mr-auto flex items-center gap-2.5 rounded-sm font-display text-2xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background lg:mr-7"
        >
          <LogoMark className="size-[34px] transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span>{siteConfig.name}</span>
        </Link>

        <nav aria-label="Primary" className="mr-auto hidden items-center gap-1 lg:flex">
          {siteConfig.nav.map((item) =>
            item.href === "/services" ? (
              <ServicesMenu key={item.href} />
            ) : (
              <Link key={item.href} href={item.href} className={NAV_LINK}>
                {item.label}
              </Link>
            )
          )}
        </nav>

        <ThemeToggle />

        <a href={siteConfig.signIn.href} rel="noopener" className={`${SIGN_IN} hidden lg:inline-block`}>
          {siteConfig.signIn.label}
        </a>
        <Link href="/#contact" className={`${FILLED} hidden lg:inline-block`}>
          {cta}
        </Link>

        {/* Native disclosure: the menu is a list of links, so a JS drawer would
            buy nothing. Services is a label above its always-listed sub-links. */}
        <NavDetails className="group relative lg:hidden [&_summary::-webkit-details-marker]:hidden">
          <summary
            aria-label="Menu"
            className="flex size-10 cursor-pointer list-none items-center justify-center rounded-[0.625rem] border border-input text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu aria-hidden className="size-5" />
          </summary>
          <nav
            aria-label="Primary"
            className="absolute right-0 top-12 max-h-[calc(100vh-5rem)] w-64 overflow-auto rounded-xl border border-border bg-card p-2 shadow-[0_18px_40px_hsl(var(--primary)/0.16)]"
          >
            {siteConfig.nav.map((item) =>
              item.href === "/services" ? (
                <div key={item.href} className="mb-1 border-b border-border pb-1">
                  <p className="px-3 pb-1 pt-2 text-sm font-semibold text-foreground">{item.label}</p>
                  {siteConfig.services.map((s) => (
                    <Link key={s.href} href={s.href} className={`${MOBILE_LINK} pl-6`}>
                      {s.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link key={item.href} href={item.href} className={MOBILE_LINK}>
                  {item.label}
                </Link>
              )
            )}
            <div className="mt-2 flex flex-col gap-2 border-t border-border px-1 pt-3">
              <a href={siteConfig.signIn.href} rel="noopener" className={`${SIGN_IN} block text-center`}>
                {siteConfig.signIn.label}
              </a>
              <Link href="/#contact" className={`${FILLED} block`}>
                {cta}
              </Link>
            </div>
          </nav>
        </NavDetails>
      </div>
    </header>
  );
}
