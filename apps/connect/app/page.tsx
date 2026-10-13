import { cn } from "@bcn-services/ui";
import { requestConnectionAction } from "./actions";
import { DashboardButton } from "./nav";
import { DisconnectControl } from "./disconnect";
import { loadClient, requireHub } from "@/lib/session";
import { mailtoLink } from "@/lib/request-connection";
import { getConfig } from "@/lib/env";
import { connectPath } from "@/lib/oauth-config";
import { reopenAppUrl } from "@/lib/shopify-oauth";
import { formatDateTime } from "@/lib/data-format";
import { relativeTime } from "./relative-time";
import { readAiLastUsed } from "@/lib/ai-settings";
import { firstRun, type MemberRow } from "@/lib/first-run";
import {
  canDisconnect,
  composeSources,
  disconnectedNote,
  googleSiblingConnected,
  shopifyControl,
  egressLine,
  formatBytes,
  type EgressRow,
  type HealthRow,
  type HubSource,
  type ShopifyControl,
  type SourceCard,
  type Tone,
} from "@/lib/sources";

export const dynamic = "force-dynamic";

/** Status label classes (globals.css `.st-*`): colour and dot style only, no pill. */
const TONE: Record<Tone, string> = {
  ok: "st-ok",
  warn: "st-warn",
  error: "st-error",
  idle: "st-idle",
};

/** Badge monogram (decoration only). */
const MONO: Record<HubSource, string> = { shopify: "Sh", meta: "Me", monday: "Mo", meet: "Mt", drive: "Dr", quickbooks: "QB" };
/**
 * The kind of data each source holds. The type filter's chips are generated from this map, and
 * each kind's hue is the `--kind-<slug>` token in globals.css (badge and chip share it).
 */
const KIND: Record<HubSource, string> = {
  shopify: "Commerce",
  meta: "Advertising",
  monday: "Projects",
  meet: "Meetings",
  drive: "Files",
  quickbooks: "Accounting",
};
const KINDS = Array.from(new Set(Object.values(KIND)));
const kindSlug = (kind: string) => kind.toLowerCase();

/** Attached: has a health row (Reconnect needed included) or is mid-disconnect. Not attached = available to connect. */
const isAttached = (c: SourceCard) => c.status !== "none" || c.disconnecting;
const needsAttention = (c: SourceCard) => c.tone === "warn" || c.tone === "error";

type SearchParams = {
  requested?: string;
  email?: string;
  error?: string;
  connected?: string;
  disconnected?: string;
  shop?: string;
  /** List state, all plain links: ?view=cards|rows, ?type=<kind slug>, ?status=attention. */
  view?: string;
  type?: string;
  status?: string;
};
type ListState = { view: "cards" | "rows"; type: string | null; attention: boolean };

/** Relative time, full timestamp on hover; `now` is taken once per request. */
function when(iso: string | null, now: number, timeZone?: string | null): React.ReactNode {
  const text = relativeTime(iso, now, timeZone);
  if (text === "never" || !iso) return text;
  return (
    <time dateTime={iso} title={formatDateTime(iso, timeZone ?? undefined)}>
      {text}
    </time>
  );
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { api, membership } = await requireHub();
  const client = await loadClient();
  const config = getConfig();
  // Only Shopify's own app-open URL for a validated shop: never a typed-in domain (rule 2.3.1).
  const restartUrl = searchParams.error === "connect-expired" ? reopenAppUrl(searchParams.shop, config.shopifyAppHandle) : null;

  const isOwner = membership.role === "owner";
  // The checklist is owner-only, so members skip its two extra reads.
  const [health, disconnecting, egress, members, aiLastUsedAt] = await Promise.all([
    api.from("connector_health_v1").select("source,status,last_run_at,last_success_at,last_error"),
    api.rpc("disconnecting_sources_v1"),
    api.from("egress_status_v1").select("*").limit(1).maybeSingle(),
    isOwner ? api.from("memberships_v1").select("user_id,role,is_smoke") : Promise.resolve({ data: null }),
    isOwner ? readAiLastUsed(api) : Promise.resolve(null),
  ]);

  const cards = composeSources(
    (health.data as HealthRow[] | null) ?? [],
    disconnecting.error ? null : (disconnecting.data as string[] | null),
  );
  const egressRow = egress.data as EgressRow | null;
  const usage = egressLine(egressRow);
  const quota = egressRow?.quota_bytes ?? 0;
  const usedPct = quota > 0 ? Math.min(100, Math.round(((egressRow?.bytes_used ?? 0) / quota) * 100)) : 0;
  const barStyle: React.CSSProperties & Record<"--p", string> = { "--p": `${usedPct}%` };
  const healthRows = (health.data as HealthRow[] | null) ?? [];
  const connectedCount = cards.filter((c) => c.connected).length;
  // Newest last success across sources; ISO strings sort chronologically.
  const lastSync = cards.reduce<string | null>((max, c) => (c.lastSuccessAt && (!max || c.lastSuccessAt > max) ? c.lastSuccessAt : max), null);
  const checklist = firstRun({
    health: (health.data as HealthRow[] | null) ?? [],
    members: (members.data as MemberRow[] | null) ?? [],
    viewerUserId: membership.userId,
    role: membership.role,
    aiLastUsedAt,
  });
  const nextStep = checklist.visible ? checklist.steps.find((s) => !s.done) : undefined;

  const list: ListState = {
    view: searchParams.view === "rows" ? "rows" : "cards",
    type: KINDS.find((k) => kindSlug(k) === searchParams.type) ?? null,
    attention: searchParams.status === "attention",
  };
  /** A list link: changes one part of the list state and keeps the rest (and an operator ?shop=). One-shot notices drop. */
  const listHref = (next: Partial<ListState>) => {
    const { view, type, attention } = { ...list, ...next };
    const q = new URLSearchParams();
    if (view === "rows") q.set("view", view);
    if (type) q.set("type", kindSlug(type));
    if (attention) q.set("status", "attention");
    // An ?error= turns the operator form off (shopifyControl); dropping only the error would turn it back on.
    if (searchParams.shop && !searchParams.error) q.set("shop", searchParams.shop);
    const qs = q.toString();
    return qs ? `/?${qs}` : "/";
  };
  const matches = (c: SourceCard, type = list.type, attention = list.attention) =>
    (!type || KIND[c.source] === type) && (!attention || needsAttention(c));
  const attentionCount = cards.filter((c) => matches(c, list.type, true)).length;
  const ctx: Ctx = { cards, config, membership, searchParams };
  const now = Date.now();
  const rowFor = (card: SourceCard) => ({
    card,
    lastSuccess: card.disconnectingNote ?? (card.pending ? "First sync pending" : when(card.lastSuccessAt, now, client?.timezone)),
    lastAttempt: when(healthRows.find((r) => r.source === card.source)?.last_run_at ?? null, now, client?.timezone),
  });
  const shown = cards.filter((c) => matches(c));
  const attached = shown.filter(isAttached).map(rowFor);
  const available = shown.filter((c) => !isAttached(c)).map(rowFor);

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
      <section className="phead" aria-labelledby="src-h">
        <div className="ph-r">
          <h1 id="src-h" className="page-title">
            Sources
          </h1>
          <DashboardButton client={client} />
        </div>
        <p className="sum">
          <span>
            {connectedCount} of {cards.length} connected
          </span>
          <span>Last sync {when(lastSync, now, client?.timezone)}</span>
          {egressRow ? (
            <span className={cn(egressRow.exceeded && "sum-x")}>
              <span className="m">
                {formatBytes(egressRow.bytes_used)} / {formatBytes(egressRow.quota_bytes)}
              </span>
              {egressRow.exceeded ? " · Quota exceeded" : " this month"}
            </span>
          ) : (
            <span>Usage not available yet</span>
          )}
        </p>
        {egressRow ? (
          <div className={cn("ubar", egressRow.exceeded && "ubar-x")} style={barStyle} role="img" aria-label={usage ?? undefined} />
        ) : null}
      </section>

      {searchParams.requested ? (
        <p role="status" className="note">
          Request sent — bcns will be in touch about {searchParams.requested}.
        </p>
      ) : null}
      {mailto ? (
        <p role="status" className="note note-plain">
          We couldn&apos;t send that automatically. Email us and we&apos;ll set up {pending}.{" "}
          <a className="btn btn-out btn-sm" href={mailto}>
            Email us
          </a>
        </p>
      ) : null}
      {searchParams.connected ? (
        <p role="status" className="note">
          {cards.find((c) => c.source === searchParams.connected)?.title ?? searchParams.connected} is connected. The first pull starts within the hour.
        </p>
      ) : null}
      {disconnectedNote(searchParams.disconnected) ? (
        <p role="status" className="note">
          {disconnectedNote(searchParams.disconnected)}
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="note note-alert">
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
                      : searchParams.error === "disconnect-failed"
                        ? "That source could not be disconnected. Nothing was changed. Try again."
                        : "Something went wrong. Try again."}
          {searchParams.error === "connect-expired" ? (
            restartUrl ? (
              <>
                {" "}
                <a className="btn btn-out btn-sm" href={restartUrl}>
                  Start again
                </a>
              </>
            ) : (
              " Open bcns Connect from your Shopify admin again."
            )
          ) : null}
        </p>
      ) : null}

      {nextStep ? (
        <section className="frs" aria-label="Get started">
          <p>
            <span className="frs-n">
              {checklist.doneCount} of {checklist.steps.length} done
            </span>
            Next: {nextStep.label}
          </p>
          <a className="btn btn-out btn-sm" href={nextStep.href}>
            {nextStep.cta}
          </a>
        </section>
      ) : null}

      <div className="stb">
        <nav className="kchips" aria-label="Filter sources">
          <a className="kch" href={listHref({ type: null })} aria-current={list.type ? undefined : "true"}>
            All <span className="n">{cards.filter((c) => matches(c, null)).length}</span>
          </a>
          {KINDS.map((kind) => (
            <a key={kind} className="kch" data-kind={kindSlug(kind)} href={listHref({ type: kind })} aria-current={list.type === kind ? "true" : undefined}>
              {kind} <span className="n">{cards.filter((c) => matches(c, kind)).length}</span>
            </a>
          ))}
          {attentionCount > 0 || list.attention ? (
            <a className="kch kch-att" href={listHref({ attention: !list.attention })} aria-current={list.attention ? "true" : undefined}>
              Needs attention <span className="n">{attentionCount}</span>
            </a>
          ) : null}
        </nav>
        <nav className="views" aria-label="Layout">
          <a href={listHref({ view: "cards" })} aria-current={list.view === "cards" ? "true" : undefined}>
            Cards
          </a>
          <a href={listHref({ view: "rows" })} aria-current={list.view === "rows" ? "true" : undefined}>
            Rows
          </a>
        </nav>
      </div>

      <div className="srcs" id="sources">
        {shown.length === 0 ? (
          <div role="status" className="empty">
            <p>No sources match these filters</p>
            <a className="btn btn-out btn-sm" href={listHref({ type: null, attention: false })}>
              Show all sources
            </a>
          </div>
        ) : list.view === "cards" ? (
          [
            { id: "con", title: "Connected", rows: attached },
            { id: "avl", title: "Available", rows: available },
          ].map((group) =>
            group.rows.length === 0 ? null : (
              <section key={group.id} aria-labelledby={`g-${group.id}`}>
                <h2 id={`g-${group.id}`} className="grp">
                  {group.title} <span className="n">{group.rows.length}</span>
                </h2>
                <div className="grid-src">
                  {group.rows.map(({ card, lastSuccess }) => (
                    <article key={card.source} data-source={card.source} className="sc">
                      <div className="sc-h">
                        <span className="sc-b" data-kind={kindSlug(KIND[card.source])} aria-hidden="true">
                          {MONO[card.source]}
                        </span>
                        <div className="sc-id">
                          <h3 className="sc-t">{card.connected ? <a href={`/sources/${card.source}`}>{card.title}</a> : card.title}</h3>
                          {isAttached(card) ? (
                            <p className="sc-s">
                              <span className={cn("st", TONE[card.tone])}>{card.label}</span>
                              {card.disconnecting ? null : <span>Last sync {lastSuccess}</span>}
                            </p>
                          ) : (
                            <p className="sc-k">{KIND[card.source]}</p>
                          )}
                        </div>
                      </div>
                      {card.disconnecting ? <p className="meta">{lastSuccess}</p> : null}
                      {card.lastError ? (
                        <p className="err" title={card.lastError}>
                          {card.lastError}
                        </p>
                      ) : null}
                      <CardActions {...ctx} card={card} />
                    </article>
                  ))}
                </div>
              </section>
            ),
          )
        ) : (
          <table className="srct">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last sync</th>
                <th>Last attempt</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {[...attached, ...available].map(({ card, lastSuccess, lastAttempt }) => (
                <tr key={card.source} data-source={card.source}>
                  <td>
                    <span className="srct-id">
                      <span className="sc-b" data-kind={kindSlug(KIND[card.source])} aria-hidden="true">
                        {MONO[card.source]}
                      </span>
                      <span className="sc-t">{card.connected ? <a href={`/sources/${card.source}`}>{card.title}</a> : card.title}</span>
                    </span>
                  </td>
                  <td data-l="Type">{KIND[card.source]}</td>
                  <td>
                    {isAttached(card) ? <span className={cn("st", TONE[card.tone])}>{card.label}</span> : <span className="mu">Not connected</span>}
                    {card.lastError ? (
                      <span className="srct-err" title={card.lastError}>
                        {card.lastError}
                      </span>
                    ) : null}
                  </td>
                  <td data-l="Last sync">{isAttached(card) ? lastSuccess : <span className="mu">—</span>}</td>
                  <td data-l="Last attempt">{isAttached(card) ? lastAttempt : <span className="mu">—</span>}</td>
                  <td className="r">
                    <CardActions {...ctx} card={card} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

type Ctx = {
  cards: SourceCard[];
  config: ReturnType<typeof getConfig>;
  membership: Awaited<ReturnType<typeof requireHub>>["membership"];
  searchParams: SearchParams;
};

/** A source's action row, shared by the cards and rows views: Connect, Request connection or Disconnect. */
function CardActions({ card, cards, config, membership, searchParams }: Ctx & { card: SourceCard }) {
  return (
    <>
      {/* Disconnecting: no Connect, Request connection or Disconnect until the worker's delete is done. */}
      {card.disconnecting ? null : (
        <div className="sc-f">
          {card.connected ? (
            <span className="flow" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : connectPath(config, card.source) && membership.role === "owner" ? (
            /**
             * Self-serve: the source's app is approved and configured. Owners only
             * (api.connect_source is owner-gated in the database). Shopify never
             * shows a shop-domain field (App Store rule 2.3.1): see shopifyControl.
             * Meta and Monday are POST so a third-party page cannot force a
             * reconnect (W5b #3).
             */
            card.source === "shopify" ? (
              <ShopifyControlView
                ctl={shopifyControl(card, searchParams.shop, searchParams.error, config.shopifyAppHandle)}
                action={connectPath(config, "shopify")!}
              />
            ) : (
              <form action={connectPath(config, card.source)!} method="POST">
                <button type="submit" className="btn btn-sm">
                  Connect
                </button>
              </form>
            )
          ) : (
            /* Unapproved, unconfigured, or a non-owner: chunk 4 behaviour, unchanged. */
            <form action={requestConnectionAction}>
              <input type="hidden" name="source" value={card.source} />
              <button type="submit" className="btn btn-out btn-sm">
                Request connection
              </button>
            </form>
          )}
          {/* Before Disconnect: its confirm popup is anchored to the row's right edge. */}
          <a className="ul tiny" href={`/sources/${card.source}#how`} aria-label={`How to connect ${card.title}`}>
            How to connect
          </a>
          {canDisconnect(card, membership.role) ? (
            <DisconnectControl source={card.source} siblingConnected={googleSiblingConnected(card.source, cards)} />
          ) : null}
        </div>
      )}
    </>
  );
}

/** The Shopify card's control; which one is decided by shopifyControl (lib/sources.ts). */
function ShopifyControlView({ ctl, action }: { ctl: ShopifyControl; action: string }) {
  if (ctl.kind === "form") {
    // Operator path: an explicit ?shop= query, sent as a hidden field, never typed.
    return (
      <form action={action} method="GET">
        <input type="hidden" name="shop" value={ctl.shop} />
        <button type="submit" className="btn btn-sm">
          {ctl.label}
        </button>
      </form>
    );
  }
  if (ctl.kind === "reconnect-in-shopify") {
    return <p className="tiny">Open bcns Connect from your Shopify admin to reconnect.</p>;
  }
  // No stored source: Connect is the App Store listing (rule 2.3.1), in a new tab. No handle configured: plain text.
  return ctl.url ? (
    <a
      className="btn btn-sm"
      href={ctl.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Connect, opens the Shopify App Store in a new tab"
    >
      Connect
    </a>
  ) : (
    <p className="tiny">Install bcns Connect from the Shopify App Store</p>
  );
}
