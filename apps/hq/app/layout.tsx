import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The marketing site's two faces, self-hosted (never next/font/google: it fetches
// at build time and fails CI when Google is unreachable; see apps/web/app/fonts/README.md).
// Variable fonts, so `weight` is an axis range, not a face list.
const manrope = localFont({
  src: "./fonts/manrope-latin-var.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "200 800",
});
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-var.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "300 700",
});

export const metadata: Metadata = { title: "HQ", description: "bcns internal command center" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
