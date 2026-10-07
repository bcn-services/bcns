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
import { readAiLastUsed } from "@/lib/ai-settings";
import { firstRun, type MemberRow } from "@/lib/first-run";
import {
  canDisconnect,
  composeSources,
  disconnectedNote,
  googleSiblingConnected,
  shopifyControl,
  egressLine,
  type EgressRow,
  type HealthRow,
  type ShopifyControl,
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

function when(iso: string | null, timeZone?: string | null): string {
  if (!iso) return "never";
  return Number.isNaN(new Date(iso).getTime()) ? "never" : formatDateTime(iso, timeZone ?? undefined);
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: { requested?: string; email?: string; error?: string; connected?: string; disconnected?: string; shop?: string };
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
  const usage = egressLine(egress.data as EgressRow | null);
  const checklist = firstRun({
    health: (health.data as HealthRow[] | null) ?? [],
    members: (members.data as MemberRow[] | null) ?? [],
    viewerUserId: membership.userId,
    role: membership.role,
    aiLastUsedAt,
  });

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
      <div>
        <h1 className="page-title">
          <b>Sources</b>
        </h1>
        <p className="lead">What bcns is pulling into your workspace, and how it is doing.</p>
      </div>

      <div className="ws">
        <div>
          <p className="n">{client?.name ?? "Your workspace"}</p>
          <p className="u">{usage ?? "Usage is not available yet."}</p>
        </div>
        <DashboardButton client={client} />
      </div>

      {searchParams.requested ? (
        <p role="status" className="note">
          Request sent — bcns will be in touch about {searchParams.requested}.
        </p>
      ) : null}
      {mailto ? (
        <p role="status" className="note note-plain">
          We couldn&apos;t send that automatically.{" "}
          <a href={mailto}>
            Email us
          </a>{" "}
          and we&apos;ll set up {pending}.
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
                <a href={restartUrl}>
                  Start again
                </a>
              </>
            ) : (
              " Open bcns Connect from your Shopify admin again."
            )
          ) : null}
        </p>
      ) : null}

      {checklist.visible ? (
        <section className="panel fr" aria-labelledby="fr-h">
          <h2 id="fr-h">Get started</h2>
          <p className="sub">{checklist.doneCount} of {checklist.steps.length} done</p>
          <ol className="fr-list">
            {checklist.steps.map((step) => (
              <li key={step.id} className={step.done ? "fr-done" : undefined}>
                <span className="fr-mark" aria-hidden="true">{step.done ? "✓" : ""}</span>
                <div className="fr-text">
                  <p className="fr-l">
                    {step.label}
                    {step.done ? <span className="sr-only"> (done)</span> : null}
                  </p>
                  {step.done ? null : <p className="fr-h">{step.hint}</p>}
                </div>
                {step.done ? null : (
                  <a className="btn btn-out btn-sm" href={step.href}>
                    {step.cta}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid-src" id="sources">
        {cards.map((card) => (
          <article key={card.source} data-source={card.source} className="sc">
            <div className="sc-h">
              <h2 className="sc-t">
                <span className="dot" aria-hidden="true" />
                {card.connected ? <a href={`/sources/${card.source}`}>{card.title}</a> : card.title}
              </h2>
              <span className={cn("st", TONE[card.tone])}>{card.label}</span>
            </div>
            <p className="meta">
              {card.disconnectingNote ?? (card.pending ? "First sync pending" : `Last success: ${when(card.lastSuccessAt, client?.timezone)}`)}
            </p>
            {card.lastError ? (
              <p className="err" title={card.lastError}>
                {card.lastError}
              </p>
            ) : null}
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
                      <button type="submit" className="btn btn-out btn-sm">
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
                {canDisconnect(card, membership.role) ? (
                  <DisconnectControl source={card.source} siblingConnected={googleSiblingConnected(card.source, cards)} />
                ) : null}
              </div>
            )}
          </article>
        ))}
      </div>
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
        <button type="submit" className="btn btn-out btn-sm">
          {ctl.label}
        </button>
      </form>
    );
  }
  if (ctl.kind === "reconnect-in-shopify") {
    return <p className="tiny">Open bcns Connect from your Shopify admin to reconnect.</p>;
  }
  return (
    <p className="tiny">
      {ctl.url ? (
        <a href={ctl.url} className="ul">
          Install bcns Connect from the Shopify App Store
        </a>
      ) : (
        "Install bcns Connect from the Shopify App Store"
      )}
    </p>
  );
}
