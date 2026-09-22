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
import { loadClient, requireHub } from "@/lib/session";
import { mailtoLink } from "@/lib/request-connection";
import { getConfig } from "@/lib/env";
import { connectPath } from "@/lib/oauth-config";
import {
  composeSources,
  dashboardUrl,
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

function when(iso: string | null): string {
  if (!iso) return "never";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "never" : at.toISOString().replace("T", " ").slice(0, 16);
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: { requested?: string; email?: string; error?: string; connected?: string };
}) {
  const { api, membership } = await requireHub();
  const client = await loadClient();
  const config = getConfig();

  const [health, egress] = await Promise.all([
    api.from("connector_health_v1").select("source,status,last_run_at,last_success_at,last_error"),
    api.from("egress_status_v1").select("*").limit(1).maybeSingle(),
  ]);

  const cards = composeSources((health.data as HealthRow[] | null) ?? []);
  const usage = egressLine(egress.data as EgressRow | null);
  const dashboard = dashboardUrl(client);

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
          {dashboard ? (
            <a href={dashboard} className="shrink-0">
              <Button type="button">Open your dashboard</Button>
            </a>
          ) : null}
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
          {searchParams.connected} is connected. The first pull starts within the hour.
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {searchParams.error === "forbidden"
            ? "That action is owner-only."
            : searchParams.error === "invalid-shop"
              ? "That does not look like a Shopify store domain. Use your-store.myshopify.com."
              : searchParams.error === "connect-failed"
                ? "The connection could not be completed. Start again, or use Request connection."
                : "Something went wrong. Try again."}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.source} className="flex flex-col">
            <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
              <div>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>Last success: {when(card.lastSuccessAt)}</CardDescription>
              </div>
              <Badge className={cn("shrink-0", TONE[card.tone])}>{card.label}</Badge>
            </CardHeader>
            <CardContent className="mt-auto flex flex-col gap-3">
              {card.lastError ? (
                <p className="text-sm text-muted-foreground" title={card.lastError}>
                  {card.lastError}
                </p>
              ) : null}
              {card.connected ? null : connectPath(config, card.source) && membership.role === "owner" ? (
                /**
                 * Self-serve: the source's app is approved and configured. A plain
                 * form, not a server action, because the handshake ends in a
                 * redirect to the provider. Shopify's /start is a GET (its install
                 * flow arrives that way and the merchant supplies their store);
                 * Meta and Monday are POST so a third-party page cannot force a
                 * reconnect (W5b #3). Owners only — api.connect_source is
                 * owner-gated in the database, so a member would consent and
                 * then be refused.
                 */
                <form
                  action={connectPath(config, card.source)!}
                  method={card.source === "shopify" ? "GET" : "POST"}
                  className="flex gap-2"
                >
                  {card.source === "shopify" ? (
                    <input
                      type="text"
                      name="shop"
                      required
                      placeholder="your-store.myshopify.com"
                      aria-label={`Your ${card.title} store domain`}
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                    />
                  ) : null}
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
