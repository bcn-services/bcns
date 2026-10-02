import Link from "next/link";
import { GUTTER } from "@/components/kit";
import { siteContent } from "@/lib/content";
import { siteConfig } from "@/lib/site";

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

const [servicesLink, ...otherNav] = siteConfig.nav;
const pillarLinks = siteConfig.services.filter((s) => s.href !== servicesLink?.href); // Connect, Deluxe, AI consulting

const LINK =
  "rounded-sm text-[0.9375rem] text-muted-foreground transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ROW = "flex flex-wrap gap-x-6 gap-y-2";

/** Prototype footer: wordmark + tagline left; two link rows right (the pages, then the ways to reach us); copyright and legal below. */
export function SiteFooter() {
  const pages = [servicesLink, ...pillarLinks, ...otherNav];
  return (
    <footer className={`${GUTTER} grid gap-7 border-t border-border pb-11 pt-[3.25rem] md:grid-cols-[minmax(14rem,22rem)_1fr] md:gap-x-12`}>
      <div>
        <Link
          href="/"
          className="rounded-sm font-display text-2xl font-semibold tracking-[-0.02em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          {siteConfig.name}
        </Link>
        <p className="mt-2.5 max-w-[24rem] text-[0.9375rem] text-muted-foreground">{siteConfig.tagline}</p>
      </div>

      <nav aria-label="Footer" className="grid content-start gap-3 md:justify-items-end">
        <ul className={`${ROW} md:justify-end`}>
          {pages.map((l) => l && (
            <li key={l.href}>
              <Link href={l.href} className={LINK}>{l.label}</Link>
            </li>
          ))}
          <li>
            <a href={siteConfig.signIn.href} rel="noopener" className={LINK}>{siteConfig.signIn.label}</a>
          </li>
        </ul>
        <ul className={`${ROW} md:justify-end`}>
          <li>
            <Link href="/#contact" className={LINK}>{siteContent.hero.ctaPrimary}</Link>
          </li>
          <li>
            <a href={`mailto:${siteConfig.email}`} className={LINK}>{siteConfig.email}</a>
          </li>
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground md:col-span-2">
        <small>
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </small>
        <ul className="flex gap-5">
          {legalLinks.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-sm transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
