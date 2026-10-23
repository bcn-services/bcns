import type { Metadata } from "next";
import localFont from "next/font/local";
import { getDataClient } from "@/lib/data";
import { getConfig } from "@/lib/env";
import { brandingMetadata, loadBranding } from "@/lib/branding";
import { PopupDismiss } from "@/app/_components/PopupDismiss";
import "./globals.css";

// Self-hosted: see fonts/README.md (no build-time Google fetch).
const interTight = localFont({
  src: "./fonts/inter-tight-latin-var.woff2",
  weight: "400 700",
  variable: "--font-inter-tight",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const FALLBACK: Metadata = {
  title: "Saunaboy Command Center",
  description: "SB Command Center: Shopify, Meta Ads, Monday.com and Google Meet in one view.",
};

/** Title and favicon from the client's branding when set; the static text above otherwise. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const client = await getDataClient();
    return brandingMetadata(client ? await loadBranding(client, getConfig().supabaseUrl) : null, FALLBACK);
  } catch {
    return FALLBACK;
  }
}

/** The shell is just the page frame: the header is per-page (app/_components/
 *  AppHeader.tsx), because a layout never receives searchParams and the whole
 *  header is driven by the ?from&to range. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable}>
      <body>
        <div className="page">{children}</div>
        <PopupDismiss />
      </body>
    </html>
  );
}
