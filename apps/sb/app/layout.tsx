import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted: see fonts/README.md (no build-time Google fetch).
const interTight = localFont({
  src: "./fonts/inter-tight-latin-var.woff2",
  weight: "400 700",
  variable: "--font-inter-tight",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Saunaboy Command Center",
  description: "SB Command Center: Shopify, Meta Ads, Monday.com and Google Meet in one view.",
};

/** The shell is just the page frame: the header is per-page (app/_components/
 *  AppHeader.tsx), because a layout never receives searchParams and the whole
 *  header is driven by the ?from&to range. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable}>
      <body>
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
