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
    { label: "Problems", href: "#problems" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Delivery", href: "#delivery" },
    { label: "Examples", href: "#examples" },
    { label: "Past Work", href: "#past-work" },
    { label: "Reviews", href: "#reviews" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
    { label: "About", href: "#about" },
    { label: "Contact", href: "#contact" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
