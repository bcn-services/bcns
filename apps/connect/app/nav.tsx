/** @jsxRuntime automatic */
/**
 * nav.tsx — the hub's links to its own pages and to the client's custom
 * dashboard. Presentational only: the caller loads the client through the
 * session (lib/session.ts `loadClient`, RLS-scoped), so tests render these
 * with a plain row.
 *
 * /data is reached only from "Your data" here. The dashboard link and button
 * exist only when the client has an `app_url`, and open in the same tab.
 *
 * The jsxRuntime pragma above is for tests/nav.test.mjs: tsx reads the
 * tsconfig's `jsx: preserve` as classic React.createElement. Next already
 * compiles with the automatic runtime, so it changes nothing in the app.
 */

import Link from "next/link";
import { Button } from "@bcn-services/ui";
import { dashboardUrl, type ClientRow } from "@/lib/sources";

export function HubNav({ client, role }: { client: ClientRow | null; role: "member" | "owner" }) {
  const dashboard = dashboardUrl(client);
  return (
    <nav className="flex items-center gap-4 text-sm text-muted-foreground">
      <Link href="/" className="hover:text-foreground">
        Sources
      </Link>
      <Link href="/data" className="hover:text-foreground">
        Your data
      </Link>
      {dashboard ? (
        <a href={dashboard} className="hover:text-foreground">
          Dashboard
        </a>
      ) : null}
      <Link href="/team" className="hover:text-foreground">
        Team
      </Link>
      {role === "owner" ? (
        <Link href="/access" className="hover:text-foreground">
          Access
        </Link>
      ) : null}
    </nav>
  );
}

export function DashboardButton({ client }: { client: ClientRow | null }) {
  const dashboard = dashboardUrl(client);
  if (!dashboard) return null;
  return (
    <a href={dashboard} className="shrink-0">
      <Button type="button">Open your dashboard</Button>
    </a>
  );
}
