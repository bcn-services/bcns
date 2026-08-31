import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/lib/site";
import "./globals.css";

// Fonts are SELF-HOSTED (next/font/local), not fetched from Google at build time.
// `next/font/google` downloads font CSS + binaries during compilation and, in a
// production build, has no timeout — if fonts.googleapis.com is unreachable it
// retries 3x and then throws, failing `next build`. The files in ./fonts are the
// latin-subset binaries Google serves (sha256 recorded in ./fonts/README.md).
//
// Both are variable fonts, so ONE file covers the whole weight axis and the
// `weight` values below are ranges, not discrete faces. Only the latin subset is
// shipped: it covers every character in the site's rendered copy.
const manrope = localFont({
  src: "./fonts/manrope-latin-var.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "300 600",
});

// Space Grotesk carries every heading, eyebrow, number and label.
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-var.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "400 700",
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
    { media: "(prefers-color-scheme: light)", color: "#FBFCFE" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1114" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${spaceGrotesk.variable} font-sans`}>
        {/* Reveal starts hidden and is un-hidden by an IntersectionObserver.
            With JS off that observer never runs, so show everything up front. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
