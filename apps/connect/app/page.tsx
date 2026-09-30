import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionHeading,
  cn,
} from "@bcn-services/ui";
import { requestConnectionAction } from "./actions";
import { DashboardButton } from "./nav";
import { loadClient, requireHub } from "@/lib/session";
import { mailtoLink } from "@/lib/request-connection";
import { getConfig } from "@/lib/env";
import { connectPath } from "@/lib/oauth-config";
import { reopenAppUrl } from "@/lib/shopify-oauth";
import { formatDateTime } from "@/lib/data-format";
import {
  composeSources,
  shopifyControl,
  egressLine,
  type EgressRow,
  type HealthRow,
  type Tone,
} from "@/lib/sources";

export const dynamic = "force-dynamic";

/** Token classes only — the preset has no "success" colour, so `ok` uses primary. */
const TONE: Record<Tone, string> = {
  ok: "border-primary/40 bg-primary/10 text-primary",
  warn: "border-accent bg-accent/25 text-accent-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  idle: "border-border bg-muted text-muted-foreground",
};

function when(iso: string | null, timeZone?: string | null): string {
  if (!iso) return "never";
  return Number.isNaN(new Date(iso).getTime()) ? "never" : formatDateTime(iso, timeZone ?? undefined);
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: { requested?: string; email?: string; error?: string; connected?: string; shop?: string };
}) {
  const { api, membership } = await requireHub();
  const client = await loadClient();
  const config = getConfig();
  // Only Shopify's own app-open URL for a validated shop: never a typed-in domain (rule 2.3.1).
  const restartUrl = searchParams.error === "connect-expired" ? reopenAppUrl(searchParams.shop, config.shopifyAppHandle) : null;

  const [health, egress] = await Promise.all([
    api.from("connector_health_v1").select("source,status,last_run_at,last_success_at,last_error"),
    api.from("egress_status_v1").select("*").limit(1).maybeSingle(),
  ]);

  const cards = composeSources((health.data as HealthRow[] | null) ?? []);
  const usage = egressLine(egress.data as EgressRow | null);

  const pending = searchParams.email;
  const mailto = pending
    ? mailtoLink({
        clientName: client?.name ?? "unknown",
        clientSlug: client?.slug ?? "unknown",
        source: pending,
        requesterEmail: membership.email,
      })
    : null;

  return (
    <>
      <SectionHeading
        as="h1"
        align="left"
        title="Sources"
        description="What bcns is pulling into your workspace, and how it is doing."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="font-medium">{client?.name ?? "Your workspace"}</p>
            <p className="text-sm text-muted-foreground">{usage ?? "Usage is not available yet."}</p>
          </div>
          <DashboardButton client={client} />
        </CardContent>
      </Card>

      {searchParams.requested ? (
        <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          Request sent — bcns will be in touch about {searchParams.requested}.
        </p>
      ) : null}
      {mailto ? (
        <p role="status" className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
          We couldn&apos;t send that automatically.{" "}
          <a href={mailto} className="font-medium text-primary underline underline-offset-4">
            Email us
          </a>{" "}
          and we&apos;ll set up {pending}.
        </p>
      ) : null}
      {searchParams.connected ? (
        <p className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {cards.find((c) => c.source === searchParams.connected)?.title ?? searchParams.connected} is connected. The first pull starts within the hour.
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {searchParams.error === "forbidden"
            ? "That action is owner-only."
            : searchParams.error === "invalid-shop"
              ? "That does not look like a valid Shopify store. Open bcns Connect from your Shopify admin to connect."
              : searchParams.error === "connect-failed"
                ? "The connection could not be completed. Start again, or use Request connection."
                : searchParams.error === "shop-in-use"
                  ? "This Shopify store is already connected to another bcns account. Sign in as that account's owner, then open bcns Connect from Shopify again."
                  : searchParams.error === "connect-expired"
                    ? "Your Shopify connection timed out before sign-in finished (it is held for 15 minutes), so nothing was saved."
                    : searchParams.error === "shop-mismatch"
                      ? "This bcns account is already connected to a different Shopify store, and one account connects one store. Email us to switch stores."
                      : "Something went wrong. Try again."}
          {searchParams.error === "connect-expired" ? (
            restartUrl ? (
              <>
                {" "}
                <a href={restartUrl} className="font-medium underline underline-offset-4">
                  Start again
                </a>
              </>
            ) : (
              " Open bcns Connect from your Shopify admin again."
            )
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.source} className="flex flex-col">
            <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
              <div>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>Last success: {when(card.lastSuccessAt, client?.timezone)}</CardDescription>
              </div>
              <Badge className={cn("shrink-0", TONE[card.tone])}>{card.label}</Badge>
            </CardHeader>
            <CardContent className="mt-auto flex flex-col gap-3">
              {card.lastError ? (
                <p className="text-sm text-muted-foreground" title={card.lastError}>
                  {card.lastError}
                </p>
              ) : null}
              {card.connected ? null : card.source === "shopify" ? (
                (() => {
                  const ctl = shopifyControl(card, searchParams.shop, searchParams.error, config.shopifyAppHandle);
                  if (ctl.kind === "form" && connectPath(config, "shopify") && membership.role === "owner") {
                    return (
                      <form action={connectPath(config, "shopify")!} method="GET" className="flex gap-2">
                        <input type="hidden" name="shop" value={ctl.shop} />
                        <Button type="submit" variant="outline" size="sm">
                          {ctl.label}
                        </Button>
                      </form>
                    );
                  }
                  if (ctl.kind === "install") {
                    return (
                      <p className="text-sm text-muted-foreground">
                        {ctl.url ? (
                          <a href={ctl.url} className="font-medium text-primary underline underline-offset-4">
                            Install bcns Connect from the Shopify App Store
                          </a>
                        ) : (
                          "Install bcns Connect from the Shopify App Store"
                        )}
                      </p>
                    );
                  }
                  if (ctl.kind === "reconnect-in-shopify") {
                    return <p className="text-sm text-muted-foreground">Open bcns Connect from your Shopify admin to reconnect.</p>;
                  }
                  return null;
                })()
              ) : connectPath(config, card.source) && membership.role === "owner" ? (
                /** Meta and Monday are POST so a third-party page cannot force a reconnect (W5b #3). Owners only (api.connect_source is owner-gated). */
                <form action={connectPath(config, card.source)!} method="POST" className="flex gap-2">
                  <Button type="submit" variant="outline" size="sm">
                    Connect
                  </Button>
                </form>
              ) : (
                /* Unapproved, unconfigured, or a non-owner: chunk 4 behaviour, unchanged. */
                <form action={requestConnectionAction}>
                  <input type="hidden" name="source" value={card.source} />
                  <Button type="submit" variant="outline" size="sm">
                    Request connection
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
