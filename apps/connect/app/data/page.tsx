import Link from "next/link";
import { cookies } from "next/headers";
import {
  Badge,
  Button,
  Card,
  CardContent,
  SectionHeading,
  buttonVariants,
  cn,
} from "@bcn-services/ui";
import { requireHub } from "@/lib/session";
import { composeSources, type HealthRow } from "@/lib/sources";
import { DATA_VIEWS, findView, sourceState, viewsFor } from "@/lib/data-views";
import { PAGE_SIZE, dataHref, fetchCounts30, fetchLast30, fetchMeta30, fetchPage, parseParams, toDataApi } from "@/lib/data-query";
import { PINS_COOKIE, buildCatalog, parsePins, resolvePins } from "@/lib/data-stats";
import { EXPORT_ROW_CAP, truncationNote } from "@/lib/data-csv";
import { formatDateTime } from "@/lib/data-format";
import { DataTable } from "./DataTable";
import { StatsStrip } from "./StatsStrip";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const FIELD = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL = "flex flex-col gap-1 text-sm font-medium text-foreground";

function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <Card>
      <CardContent role="status" className="flex flex-col items-start gap-3 pt-6">
        <p className="font-medium">{title}</p>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Go to Sources
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function DataPage({ searchParams }: { searchParams: SearchParams }) {
  const { api: schema } = await requireHub();
  const api = toDataApi(schema);

  const now = new Date();
  const [health, last30Result] = await Promise.all([
    schema.from("connector_health_v1").select("source,status,last_run_at,last_success_at,last_error"),
    fetchLast30(api, now),
  ]);
  const last30 = last30Result.totals;
  const cards = composeSources((health.data as HealthRow[] | null) ?? []);
  const connected = cards.filter((c) => c.connected);
  const connectedSources = connected.map((c) => c.source);

  const heading = (
    <SectionHeading
      as="h1"
      align="left"
      title="Your data"
      description="Search, filter and export what bcns has pulled into your workspace."
    />
  );

  if (connected.length === 0) {
    const waiting = cards.some((c) => c.status !== "none");
    return (
      <>
        {heading}
        <EmptyState
          title={waiting ? "Connected, first sync in progress" : "Not connected"}
          message={
            waiting
              ? "Your data appears here after the first sync finishes. That starts within the hour."
              : "Connect a source on the Sources page and its data will show up here."
          }
        />
      </>
    );
  }

  // Tabs: every source with a health row. Connected ones show data; the rest say why they cannot yet.
  const tabs = cards.filter((c) => c.status !== "none");
  const wanted = first(searchParams.source);
  // connected[0] exists (the empty case returned above); every source has at least one view.
  const card = tabs.find((c) => c.source === wanted) ?? connected[0]!;
  const state = sourceState(card);
  const views = viewsFor(card.source);
  const cfg = findView(card.source, first(searchParams.view)) ?? views[0]!;
  const params = parseParams(searchParams);

  // Stats span every connected source; the pinned strip is the same on every tab. All reads run together.
  const [counts, meta, result] = await Promise.all([
    fetchCounts30(api, DATA_VIEWS.filter((v) => connectedSources.includes(v.source)), now),
    connectedSources.includes("meta") ? fetchMeta30(api, now) : null,
    state.kind === "ready" ? fetchPage(api, cfg, params) : null,
  ]);
  const catalog = buildCatalog(connectedSources, { counts, last30, meta });
  const pinned = resolvePins(parsePins(cookies().get(PINS_COOKIE)?.value), catalog, connectedSources);

  const pages = result ? Math.max(1, Math.ceil(result.count / PAGE_SIZE)) : 1;
  const link = (page: number) => dataHref("/data", { source: card.source, view: cfg.id, ...params, page });
  const filtered = Boolean(params.q || params.from || params.to);
  const exportHref = dataHref("/data/export", { source: card.source, view: cfg.id, ...params });

  return (
    <>
      {heading}

      <p className="text-sm text-muted-foreground">
        {connected.map((c) => `${c.title} synced ${c.lastSuccessAt ? formatDateTime(c.lastSuccessAt) : "never"}`).join(" · ")}
      </p>

      <StatsStrip
        pinned={catalog.filter((s) => pinned.includes(s.id))}
        catalog={catalog}
        sources={connected}
        returnTo={link(params.page)}
      />

      <nav aria-label="Data sources" className="flex flex-wrap gap-2">
        {tabs.map((c) => (
          <Link
            key={c.source}
            href={`/data?source=${c.source}`}
            aria-current={c.source === card.source ? "page" : undefined}
            className={buttonVariants({ variant: c.source === card.source ? "default" : "outline", size: "sm" })}
          >
            {c.title}
            {c.connected ? null : <Badge className="px-2 py-0">{c.label}</Badge>}
          </Link>
        ))}
      </nav>

      {state.kind !== "ready" || !result ? (
        <EmptyState
          title={state.kind === "ready" ? "Nothing to show" : state.message}
          message={
            state.kind === "pending"
              ? "Your data appears here after the first sync finishes. That starts within the hour."
              : state.kind === "reconnect"
                ? "bcns lost access to this source. Reconnect it on the Sources page."
                : undefined
          }
        />
      ) : (
        <>
          <nav aria-label={`${card.title} views`} className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border text-sm">
            {views.map((v) => {
              const count = counts[`${card.source}/${v.id}`];
              return (
                <Link
                  key={v.id}
                  href={`/data?source=${card.source}&view=${v.id}`}
                  aria-current={v.id === cfg.id ? "page" : undefined}
                  className={cn(
                    "-mb-px rounded-sm border-b-2 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    v.id === cfg.id
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v.label}
                  <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    <span aria-hidden="true">
                      {count?.toLocaleString("en-US") ?? "—"} <span className="text-[10px]">30d</span>
                    </span>
                    <span className="sr-only">{count == null ? " count unavailable" : ` ${count.toLocaleString("en-US")} rows in the last 30 days`}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <form method="get" action="/data" className="flex w-full flex-wrap items-end gap-3 lg:w-auto">
              <input type="hidden" name="source" value={card.source} />
              <input type="hidden" name="view" value={cfg.id} />
              <label className={cn(LABEL, "w-full sm:w-56")}>
                Search
                <input type="search" name="q" defaultValue={params.q} maxLength={100} placeholder="Search…" className={FIELD} />
              </label>
              <label className={cn(LABEL, "min-w-0 flex-1 sm:w-40 sm:flex-none")}>
                From
                <input type="date" name="from" defaultValue={params.from ?? ""} className={FIELD} />
              </label>
              <label className={cn(LABEL, "min-w-0 flex-1 sm:w-40 sm:flex-none")}>
                To
                <input type="date" name="to" defaultValue={params.to ?? ""} className={FIELD} />
              </label>
              <div className="flex gap-2">
                <Button type="submit">Apply</Button>
                <Link href={`/data?source=${card.source}&view=${cfg.id}`} className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              </div>
            </form>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <a href={exportHref} className={buttonVariants({ variant: "outline" })}>
                Export CSV
              </a>
              {result.count > EXPORT_ROW_CAP ? (
                <p role="status" className="max-w-xs text-xs text-muted-foreground sm:text-right">
                  {truncationNote()}
                </p>
              ) : null}
            </div>
          </div>

          {result.error ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              This view could not be loaded. Try again in a moment.
              {params.page > 1 ? (
                <>
                  {" "}
                  <Link href={link(1)} className="underline underline-offset-4">
                    Back to the first page
                  </Link>
                </>
              ) : null}
            </p>
          ) : result.rows.length === 0 ? (
            <div role="status" className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card px-6 py-10 text-sm">
              <p className="font-medium">
                {params.page > 1 ? "No rows on this page" : filtered ? "No rows match these filters" : "Nothing here yet"}
              </p>
              <p className="text-muted-foreground">
                {params.page > 1
                  ? "You are past the last page of results."
                  : filtered
                    ? "Try a wider date range or a different search."
                    : "Rows show up here as bcns pulls in new data from this source."}
              </p>
              {params.page > 1 || filtered ? (
                <Link
                  href={params.page > 1 ? link(1) : `/data?source=${card.source}&view=${cfg.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {params.page > 1 ? "Back to the first page" : "Clear filters"}
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <DataTable cfg={cfg} rows={result.rows} />

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <p className="tabular-nums">
                  Showing {result.start + 1}–{result.start + result.rows.length} of {result.count.toLocaleString("en-US")}
                </p>
                <nav aria-label="Pagination" className="flex items-center gap-2">
                  <span className="tabular-nums">
                    Page {params.page} of {pages}
                  </span>
                  {params.page > 1 ? (
                    <Link href={link(params.page - 1)} rel="prev" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Previous
                    </Link>
                  ) : (
                    <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
                      Previous
                    </span>
                  )}
                  {params.page < pages ? (
                    <Link href={link(params.page + 1)} rel="next" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Next
                    </Link>
                  ) : (
                    <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
                      Next
                    </span>
                  )}
                </nav>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
