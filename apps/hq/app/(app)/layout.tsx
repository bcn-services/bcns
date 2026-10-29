import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSession();
  // The middleware already gates this (and forwards the session read here); every page query is still RLS-gated.
  if (!user || !profile) redirect("/login");
  const handle = profile.handle ?? profile.display_name ?? user.email ?? "you";
  return (
    <div className="app">
      <header className="top">
        <div className="logo">
          <i>H</i> HQ
        </div>
        <Nav />
        <form action="/signout" method="post" className="me">
          <span className="av">{handle.charAt(0).toUpperCase()}</span>
          <span data-testid="handle">{handle}</span>
          <button type="submit" className="lnkb">
            Sign out
          </button>
        </form>
      </header>
      <div className="wrap">{children}</div>
    </div>
  );
}
