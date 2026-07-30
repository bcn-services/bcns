/**
 * Central place for site-wide constants and marketing copy.
 *
 * What actually reaches production: `url` only. It feeds metadataBase, OpenGraph,
 * robots.txt, and every sitemap entry, and it reads NEXT_PUBLIC_SITE_URL — so the
 * live domain is set by that env var in the Vercel project, not by editing this
 * file. `domain` is referenced only by a registry test; `email` is currently
 * consumed nowhere.
 *
 * TODO(rename): `name` is still "bcns" while the domain is bcn-services.com.
 * TODO(email): `email` needs a mailbox that actually exists before it is linked
 * anywhere user-facing.
 */
export const siteConfig = {
  name: "bcns",
  domain: "bcn-services.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  tagline: "Custom software for local businesses — built to fit how you already work.",
  description:
    "bcns designs and builds custom software for local small businesses — the tools that don't exist off the shelf, cost too much from enterprise vendors, or never quite fit your workflow. You own what we build.",
  email: "nseluga@bcn-services.com",
  nav: [
    { label: "Services", href: "/services" },
    { label: "Work", href: "/work" },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
