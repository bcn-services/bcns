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
  searchParams: { requested?: string; email?: string; error?: string };
}) {
  const { api, membership } = await requireHub();
  const client = await loadClient();

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
      {searchParams.error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {searchParams.error === "forbidden"
            ? "That action is owner-only."
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
              {card.connected ? null : (
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
