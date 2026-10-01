import Link from "next/link";
import { cookies } from "next/headers";
import { cn } from "@bcn-services/ui";
import { loadClient, requireHub } from "@/lib/session";
import { composeSources, type HealthRow } from "@/lib/sources";
import { DATA_VIEWS, composeDataPage, findView, viewsFor } from "@/lib/data-views";
import { PAGE_SIZE, dataHref, fetchCounts30, fetchLast30, fetchMeta30, fetchPage, parseParams, toDataApi } from "@/lib/data-query";
import { PINS_COOKIE, buildCatalog, parsePins, resolvePins } from "@/lib/data-stats";
import { EXPORT_ROW_CAP, truncationNote } from "@/lib/data-csv";
import { DataTable } from "./DataTable";
import { StatsStrip } from "./StatsStrip";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const LABEL = "field";
const BTN = "btn";
const BTN_OUT = "btn btn-out";
const BTN_OUT_SM = "btn btn-out btn-sm";
const BTN_GHOST = "btn btn-ghost";

function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div role="status" className="empty">
      <p>{title}</p>
      {message ? <p>{message}</p> : null}
      <Link href="/" className={BTN_OUT_SM}>
        Go to Sources
      </Link>
    </div>
  );
}

export default async function DataPage({ searchParams }: { searchParams: SearchParams }) {
  const { api: schema } = await requireHub();
  const timezone = (await loadClient())?.timezone ?? undefined;
  const api = toDataApi(schema);

  const now = new Date();
  const [health, last30Result] = await Promise.all([
    schema.from("connector_health_v1").select("source,status,last_run_at,last_success_at,last_error"),
    fetchLast30(api, now),
  ]);
  const last30 = last30Result.totals;
  const cards = composeSources((health.data as HealthRow[] | null) ?? []);
  const wanted = first(searchParams.source);
  // composeDataPage (lib/data-views.ts) decides the tabs, what to fetch, notices and empty copy.
  const plan = composeDataPage(cards, { wanted, timezone });
  // Sources with stored rows to show: connected ones, plus auth_failed ones (rows survive a broken token).
  const connected = plan.dataCards;
  const connectedSources = connected.map((c) => c.source);

  const heading = (
    <div>
      <h1 className="page-title">
        Your <b>data</b>
      </h1>
      <p className="lead">Search, filter and export what bcns has pulled into your workspace.</p>
    </div>
  );

  if (!plan.card) {
    const copy = plan.emptyCopy!; // composeDataPage always sets emptyCopy when there is no active card
    return (
      <>
        {heading}
        <EmptyState title={copy.title} message={copy.message} />
      </>
    );
  }

  // Tabs: every source with a health row. Data sources show rows; the rest say why they cannot yet.
  const card = plan.card;
  const views = viewsFor(card.source);
  const cfg = findView(card.source, first(searchParams.view)) ?? views[0]!;
  const params = parseParams(searchParams);

  // Stats span every connected source; the pinned strip is the same on every tab. All reads run together.
  const [counts, meta, result] = await Promise.all([
    fetchCounts30(api, DATA_VIEWS.filter((v) => connectedSources.includes(v.source)), now),
    connectedSources.includes("meta") ? fetchMeta30(api, now) : null,
    plan.fetchesPage ? fetchPage(api, cfg, params) : null,
  ]);
  const catalog = buildCatalog(connectedSources, { counts, last30, meta });
  const pinned = resolvePins(parsePins(cookies().get(PINS_COOKIE)?.value), catalog, connectedSources);

  const pages = result ? Math.max(1, Math.ceil(result.count / PAGE_SIZE)) : 1;
  const link = (page: number) => dataHref("/data", { source: card.source, view: cfg.id, ...params, page });
  const filtered = Boolean(params.q || params.from || params.to);
  const exportHref = dataHref("/data/export", { source: card.source, view: cfg.id, ...params });
  // Second pass now the row count is known: an empty unfiltered first page changes the copy.
  const view = composeDataPage(cards, {
    wanted,
    timezone,
    activeEmpty: Boolean(result && !result.error && result.count === 0 && !filtered && params.page === 1),
  });

  return (
    <>
      {heading}

      <p className="sync">{view.syncLine}</p>

      <StatsStrip
        pinned={catalog.filter((s) => pinned.includes(s.id))}
        catalog={catalog}
        sources={connected}
        returnTo={link(params.page)}
      />

      {view.notices.map((n) => (
        <p key={n.source} role="alert" className="note note-alert">
          {n.text}{" "}
          <Link href="/">
            Go to Sources
          </Link>
        </p>
      ))}

      <nav aria-label="Data sources" className="tabs">
        {view.tabs.map((c) => (
          <Link
            key={c.source}
            href={`/data?source=${c.source}`}
            aria-current={c.source === card.source ? "page" : undefined}
          >
            {c.title}
            {c.connected && !c.pending ? null : <span className="chip">{c.pending ? "Awaiting first pull" : c.label}</span>}
          </Link>
        ))}
      </nav>

      {!view.fetchesPage || !result ? (
        <EmptyState title={view.emptyCopy?.title ?? "Nothing to show"} message={view.emptyCopy?.message} />
      ) : (
        <>
          <nav aria-label={`${card.title} views`} className="views">
            {views.map((v) => {
              const count = counts[`${card.source}/${v.id}`];
              return (
                <Link
                  key={v.id}
                  href={`/data?source=${card.source}&view=${v.id}`}
                  aria-current={v.id === cfg.id ? "page" : undefined}
                >
                  {v.label}
                  <span className="n">
                    <span aria-hidden="true">{count?.toLocaleString("en-US") ?? "—"} 30d</span>
                    <span className="sr-only">{count == null ? " count unavailable" : ` ${count.toLocaleString("en-US")} rows in the last 30 days`}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="tools">
            <form method="get" action="/data">
              <input type="hidden" name="source" value={card.source} />
              <input type="hidden" name="view" value={cfg.id} />
              <label className={cn(LABEL, "w-full sm:w-56")}>
                Search
                <input type="search" name="q" defaultValue={params.q} maxLength={100} placeholder="Search…" />
              </label>
              <label className={cn(LABEL, "min-w-0 flex-1 sm:w-40 sm:flex-none")}>
                From
                <input type="date" name="from" defaultValue={params.from ?? ""} />
              </label>
              <label className={cn(LABEL, "min-w-0 flex-1 sm:w-40 sm:flex-none")}>
                To
                <input type="date" name="to" defaultValue={params.to ?? ""} />
              </label>
              <div className="acts">
                <button type="submit" className={BTN}>
                  Apply
                </button>
                <Link href={`/data?source=${card.source}&view=${cfg.id}`} className={BTN_GHOST}>
                  Clear
                </Link>
              </div>
            </form>
            <div className="exp">
              {result.count > 0 ? (
                <a href={exportHref} className={BTN_OUT}>
                  Export CSV
                </a>
              ) : null}
              {result.count > EXPORT_ROW_CAP ? (
                <p role="status" className="meta">
                  {truncationNote()}
                </p>
              ) : null}
            </div>
          </div>

          {result.error ? (
            <p role="alert" className="note note-alert">
              This view could not be loaded. Try again in a moment.
              {params.page > 1 ? (
                <>
                  {" "}
                  <Link href={link(1)}>
                    Back to the first page
                  </Link>
                </>
              ) : null}
            </p>
          ) : result.rows.length === 0 ? (
            <div role="status" className="empty">
              <p>
                {params.page > 1 ? "No rows on this page" : filtered ? "No rows match these filters" : view.emptyCopy?.title ?? "Nothing here yet"}
              </p>
              <p>
                {params.page > 1
                  ? "You are past the last page of results."
                  : filtered
                    ? "Try a wider date range or a different search."
                    : view.emptyCopy?.message ?? "Rows show up here as bcns pulls in new data from this source."}
              </p>
              {params.page > 1 || filtered ? (
                <Link
                  href={params.page > 1 ? link(1) : `/data?source=${card.source}&view=${cfg.id}`}
                  className={BTN_OUT_SM}
                >
                  {params.page > 1 ? "Back to the first page" : "Clear filters"}
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <DataTable cfg={cfg} rows={result.rows} />

              <div className="pager">
                <p>
                  Showing {result.start + 1}–{result.start + result.rows.length} of {result.count.toLocaleString("en-US")}
                </p>
                <nav aria-label="Pagination">
                  <span>
                    Page {params.page} of {pages}
                  </span>
                  {params.page > 1 ? (
                    <Link href={link(params.page - 1)} rel="prev" className={BTN_OUT_SM}>
                      Previous
                    </Link>
                  ) : (
                    <span aria-disabled="true" className={BTN_OUT_SM}>
                      Previous
                    </span>
                  )}
                  {params.page < pages ? (
                    <Link href={link(params.page + 1)} rel="next" className={BTN_OUT_SM}>
                      Next
                    </Link>
                  ) : (
                    <span aria-disabled="true" className={BTN_OUT_SM}>
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
