/**
 * Site-wide constants: name, domain, nav, and the two lines of copy that are
 * not page content (`tagline`, `description`). Page copy lives in `content.ts`.
 *
 * `url` reads NEXT_PUBLIC_SITE_URL, so the live domain is set in the Vercel
 * project, not here. `tagline` and `description` feed the default page title,
 * OpenGraph, the footer, JSON-LD and llms.txt.
 *
 * TODO(rename): `name` is still "bcns" while the domain is bcn-services.com.
 */
export const siteConfig = {
  name: "bcns",
  domain: "bcn-services.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  tagline: "Software and AI tools that give small businesses time back.",
  description:
    "bcns builds software and AI tools around how a small business already runs, so the busywork gets done without the owner. It starts by connecting the tools you already use. Your data is always yours.",
  email: "nseluga@bcn-services.com",
  /** JSON-LD only (Organization.legalName / description); not rendered. */
  legalName: "BCNS LLC",
  serviceArea: "We work remotely with small businesses across the US.",
  nav: [
    { label: "Services", href: "/services" },
    { label: "Work", href: "/work" },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ],
  /** Services dropdown (desktop) and the sub-links in the mobile menu. */
  services: [
    { label: "Overview", href: "/services", blurb: "Three ways to get time back" },
    { label: "bcns Connect", href: "/services/connect", blurb: "Every tool in one organized place" },
    { label: "Deluxe builds", href: "/services/deluxe", blurb: "Tools that do your busywork" },
    { label: "AI consulting", href: "/services/ai-consulting", blurb: "One day on your business" },
  ],
  signIn: { label: "Sign in to Connect", href: "https://connect.bcn-services.com" },
} as const;

export type SiteConfig = typeof siteConfig;
