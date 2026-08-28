import Link from "next/link";
import { LogoMark } from "@/components/cube";
import { siteConfig } from "@/lib/site";

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "/#contact" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col items-center justify-between gap-6 px-6 py-12 sm:flex-row lg:px-12">
        <div className="flex flex-col items-center gap-2.5 sm:items-start">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-sm font-display font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <LogoMark className="h-5 w-[1.53rem]" />
            {siteConfig.name}
          </Link>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
        </div>

        <nav aria-label="Footer" className="flex items-center gap-7">
          {legalLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
