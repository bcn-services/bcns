/**
 * Central place for site-wide constants and marketing copy.
 * TODO(rename): update `name`, `domain`, and `email` once the business name is
 * chosen (these also feed metadata and the footer).
 */
export const siteConfig = {
  name: "bcns",
  // TODO: replace with real production domain once purchased.
  domain: "bcns.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  tagline: "Custom software for local businesses — built to fit how you already work.",
  description:
    "bcns designs and builds custom software for local small businesses — the tools that don't exist off the shelf, cost too much from enterprise vendors, or never quite fit your workflow. You own what we build.",
  // TODO: replace with a real inbox before launch.
  email: "hello@bcns.com",
  nav: [
    { label: "Services", href: "/services" },
    { label: "Work", href: "/work" },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
