import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@bcn-services/ui";
import { currentMembership, loadClient } from "@/lib/session";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "bcns Connect",
  description: "Your sources, your team, and your data access — in one place.",
};

/** Signed out (the /login page) the header is just the wordmark: no nav, no sign-out. */
async function Header() {
  const membership = await currentMembership();
  const client = membership ? await loadClient() : null;

  return (
    <header className="border-b border-border bg-card">
      <Container className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          bcns <span className="text-primary">Connect</span>
        </Link>
        {membership ? (
          <>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                Sources
              </Link>
              <Link href="/data" className="hover:text-foreground">
                Your data
              </Link>
              <Link href="/team" className="hover:text-foreground">
                Team
              </Link>
              {membership.role === "owner" ? (
                <Link href="/access" className="hover:text-foreground">
                  Access
                </Link>
              ) : null}
            </nav>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{client?.name ?? "Your workspace"}</span>
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </>
        ) : null}
      </Container>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="py-10">
          <Container className="flex flex-col gap-8">{children}</Container>
        </main>
      </body>
    </html>
  );
}
