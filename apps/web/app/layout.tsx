import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/lib/site";
import "./globals.css";

// Fonts are SELF-HOSTED (next/font/local), not fetched from Google at build time.
// `next/font/google` downloads font CSS + binaries during compilation: 16 network
// round-trips for these three families, with no timeout on a production build. If
// fonts.googleapis.com is unreachable it retries 3x and then throws, failing
// `next build` — a CI/deploy dependency on Google's CDN for a site that needs no
// runtime network. The files in ./fonts are the exact latin-subset binaries Google
// was serving (byte-identical, sha256 recorded in ./fonts/README.md).
//
// All three are variable fonts, so ONE file covers the whole weight axis and the
// `weight` values below are ranges, not discrete faces. Only the latin subset is
// shipped: it covers every character in the site's copy (verified — the only
// non-latin glyph anywhere, "→", appears solely in code comments, and no Google
// subset carries it regardless).
const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin-var.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "200 800",
});

// Serif accent face — used for exactly ONE italic accent word per headline
// (never for body). Exposed as `font-serif-accent` in the Tailwind preset.
// Italic-only: the upright cut is never used, so it is not shipped.
const fraunces = localFont({
  src: "./fonts/fraunces-italic-latin-var.woff2",
  variable: "--font-serif-accent",
  display: "swap",
  weight: "100 900",
  style: "italic",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "custom software",
    "small business software",
    "local business apps",
    "internal tools",
    "software consulting",
  ],
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5FA" },
    { media: "(prefers-color-scheme: dark)", color: "#15131F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${bricolage.variable} ${fraunces.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
