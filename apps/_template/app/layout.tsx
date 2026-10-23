import type { Metadata } from "next";
import { getDataClient } from "@/lib/data";
import { getConfig } from "@/lib/env";
import { brandingMetadata, loadBranding } from "@/lib/branding";
import "./globals.css";

const FALLBACK: Metadata = {
  title: "bcns App Template",
  description: "A hosted client-app starter for the bcns studio.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
