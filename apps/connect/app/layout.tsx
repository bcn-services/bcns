import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { currentMembership, loadClient } from "@/lib/session";
import type { ClientRow } from "@/lib/sources";
import { loadBilling } from "@/lib/stripe-billing";
import { BillingBanner } from "./billing-banner";
import { signOut } from "./login/actions";
import { HubNav } from "./nav";
import "./globals.css";

// Self-hosted (next/font/local), never next/font/google: see fonts/README.md.
const manrope = localFont({
  src: "./fonts/manrope-latin-var.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "300 600",
});

// The file covers 300..700; the hub's light page titles use 300, so the range starts there.
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-var.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "300 700",
});

export const metadata: Metadata = {
  title: "bcns Connect",
  description: "Your sources, your team, and your data access — in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFCFE" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1114" },
  ],
};

/** Signed in: wordmark, nav, workspace name and sign-out. */
function Header({ membership, client }: { membership: NonNullable<Awaited<ReturnType<typeof currentMembership>>>; client: ClientRow | null }) {
  return (
    <header className="hh">
      <div className="hh-in">
        <Link href="/" className="wm">
          <span className="wm-mark" aria-hidden="true" />
          <span>
            bcns <b>Connect</b>
          </span>
        </Link>
        <HubNav client={client} role={membership.role} />
        <div className="who">
          <span>{client?.name ?? "Your workspace"}</span>
          <form action={signOut}>
            <button type="submit" className="btn btn-out btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const membership = await currentMembership();
  // Signed out (the login pages) draw their own full-page frame and wordmark.
  const client = membership ? await loadClient() : null;
  const billing = membership ? await loadBilling() : null;
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        {membership ? (
          <>
            <Header membership={membership} client={client} />
            <main className="app">
              <BillingBanner billing={billing} />
              {children}
            </main>
            <footer className="hfoot">
              bcns Connect &middot; <a href="https://bcn-services.com">Back to bcn-services.com</a>
            </footer>
          </>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
