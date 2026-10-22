import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@bcn-services/ui";
import { loadClient, requireHub } from "@/lib/session";
import { formatDateTime } from "@/lib/data-format";
import {
  EMPTY_FOLDER_WARNING,
  ERROR_MESSAGES,
  OK_MESSAGES,
  isHubSource,
  sourcePage,
  type RunRow,
  type SettingsRow,
} from "@/lib/source-settings";
import { changeFolderAction, resyncAction } from "./actions";
import { DisconnectControl } from "@/app/disconnect";
import { SourceGuide } from "@/app/source-guide";
import { canDisconnect, composeSources, googleSiblingConnected, type HealthRow } from "@/lib/sources";

export const dynamic = "force-dynamic";

const TONE = { ok: "st-ok", warn: "st-warn", error: "st-error", idle: "st-idle" } as const;

export default async function SourceSettingsPage({
  params,
  searchParams,
}: {
  params: { source: string };
  searchParams: { ok?: string; error?: string };
}) {
  if (!isHubSource(params.source)) notFound();
  const source = params.source;
  const { api, membership } = await requireHub();
  const client = await loadClient();
  const tz = client?.timezone ?? undefined;
  const at = (iso: string | null) => (iso && !Number.isNaN(new Date(iso).getTime()) ? formatDateTime(iso, tz) : "never");

  const [settings, runs, health, disconnecting] = await Promise.all([
    api.rpc("source_settings_v1"),
    api.rpc("connector_runs_v1", { p_source: source }),
    // Every source: the Status badge; meet/drive also need the other Google source for the Disconnect text.
    api.from("connector_health_v1").select("source,status,last_success_at,last_error"),
    api.rpc("disconnecting_sources_v1"),
  ]);
  const page = sourcePage({
    source,
    settings: settings.data as SettingsRow[] | null,
    runs: runs.data as RunRow[] | null,
    role: membership.role,
    now: new Date(),
    health: health.error ? null : (health.data as HealthRow[] | null),
    disconnecting: disconnecting.error ? null : (disconnecting.data as string[] | null),
  });
  const ok = searchParams.ok ? OK_MESSAGES[searchParams.ok] : undefined;
  const disc = { source, status: page.connected ? "ok" : "none" } as const;
  // An uninstalled Shopify store has a disabled schedule row and no health row: still disconnectable.
  const bound = page.stored ? [source] : [];

  return (
    <div className="pg" data-source={source}>
      <section className="phead" aria-labelledby="source-h">
        <p className="crumb">
          <Link href="/#sources">Sources</Link> / {page.title}
        </p>
        <div className="ph-t">
          <h1 id="source-h" className="page-title">
            {page.title}
          </h1>
          <span className={cn("st", TONE[page.status.tone])}>{page.status.label}</span>
        </div>
      </section>

      {ok ? (
        <p role="status" className="note">
          {ok}
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="note note-alert">
          {ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.failed}
        </p>
      ) : null}
      {settings.error ? (
        <p role="alert" className="note note-alert">
          We couldn&apos;t load this source&apos;s settings. Try again, or email bcns.
        </p>
      ) : null}

      <article className="sc" data-source={source}>
        <h2 className="sc-t">Status</h2>
        {page.lastError ? (
          <div>
            <p className="err">{page.lastError.problem}</p>
            <details className="ss-why">
              <summary>Details</summary>
              <code className="m">{page.lastError.raw}</code>
            </details>
          </div>
        ) : null}
        {page.connected ? (
          <dl className="ss-dl">
            <div className="ss-row">
              <dt>Last success</dt>
              <dd>{at(page.lastSuccessAt)}</dd>
            </div>
            <div className="ss-row">
              <dt>Last sync</dt>
              <dd>{at(page.lastRunAt)}</dd>
            </div>
            {page.target.map((line) => (
              <div key={line.label} className="ss-row">
                <dt>{line.label}</dt>
                <dd>
                  {line.href ? (
                    <a href={line.href} target="_blank" rel="noopener noreferrer">
                      {line.text}
                    </a>
                  ) : (
                    line.text
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : page.disconnecting ? (
          <p className="meta">{page.disconnecting}</p>
        ) : (
          <p className="meta">
            This source isn&apos;t connected. Connect it from the Sources page.{" "}
            <Link href="/#sources" className="btn btn-out btn-sm">
              Go to Sources
            </Link>
          </p>
        )}
      </article>

      <SourceGuide source={source} />

      {page.resync ? (
        <section className="panel" aria-labelledby="resync-h">
          <div className="hd">
            <h2 id="resync-h">Sync everything again</h2>
            <details className="pop">
              <summary aria-label="About syncing everything again">?</summary>
              <div className="pop-b">
                Pulls all of this source&apos;s history again, starting on the next sync, within the hour. Use it if
                something looks missing. Once an hour at most.
              </div>
            </details>
          </div>
          <p className="sub">Last done: {at(page.resync.lastResetAt)}</p>
          <form action={resyncAction} className="ss-act">
            <input type="hidden" name="source" value={source} />
            <button type="submit" className="btn btn-out btn-sm" disabled={page.resync.kind !== "ready"}>
              Sync everything again
            </button>
            {page.resync.kind === "wait" ? (
              <span className="tiny">Available again at {at(page.resync.until)}</span>
            ) : page.resync.kind === "running" ? (
              <span className="tiny">A sync is running. Try again in a few minutes.</span>
            ) : null}
          </form>
        </section>
      ) : null}

      {page.folder ? (
        <section className="panel" aria-labelledby="folder-h">
          <div className="hd">
            <h2 id="folder-h">Change folder</h2>
            <details className="pop">
              <summary aria-label="About changing the folder">?</summary>
              <div className="pop-b">
                Paste the link to the Google Drive folder {source === "meet" ? "your meeting notes are saved in" : "to bring in"}.
                The folder is checked on the next sync, within the hour.
              </div>
            </details>
          </div>
          {page.folder.check === "pending" && !ok ? (
            <p role="status" className="note note-plain">
              New folder saved. It will be checked on the next sync, within the hour.
            </p>
          ) : page.folder.check === "empty" ? (
            <p role="alert" className="note note-alert">
              {EMPTY_FOLDER_WARNING}
            </p>
          ) : null}
          <form action={changeFolderAction} className="ss-act">
            <input type="hidden" name="source" value={source} />
            <label className="field" htmlFor="folder">
              Folder link
              <input id="folder" name="folder" type="text" inputMode="url" required autoComplete="off"
                placeholder="https://drive.google.com/drive/folders/…"
                aria-describedby={source === "drive" ? "folder-hint" : undefined} />
              {/* Data-loss warning: stays visible, not in the popup. */}
              {source === "drive" ? (
                <span id="folder-hint" className="hint">
                  Files that are not in the new folder are removed from your workspace.
                </span>
              ) : null}
            </label>
            <button type="submit" className="btn btn-sm" disabled={page.syncRunning}>
              Save folder
            </button>
          </form>
        </section>
      ) : null}

      {/* Same gate and control as the Sources card; "connected" here is an enabled schedule. */}
      {canDisconnect(disc, membership.role, bound) ? (
        <section className="panel panel-disc" aria-labelledby="disconnect-h">
          <div className="hd">
            <h2 id="disconnect-h">Disconnect</h2>
            <details className="pop">
              <summary aria-label="About disconnecting">?</summary>
              <div className="pop-b">Stop syncing this source and delete what bcns stored from it.</div>
            </details>
          </div>
          <DisconnectControl
            source={disc.source}
            siblingConnected={
              health.error ? null : googleSiblingConnected(source, composeSources(health.data as HealthRow[] | null))
            }
          />
        </section>
      ) : null}

      {page.disconnecting ? null : (
        <section className="panel" aria-labelledby="runs-h">
          <h2 id="runs-h">Recent syncs</h2>
          {page.runs.length === 0 ? (
            <p className="sub">No syncs yet.</p>
          ) : (
            <div className="tablewrap ss-runs">
              <table>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Kind</th>
                    <th>Result</th>
                    <th className="r">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {page.runs.map((run, i) => (
                    <tr key={`${run.startedAt}-${i}`}>
                      <td>{at(run.startedAt)}</td>
                      <td>{run.kind}</td>
                      <td>
                        <span className={cn("st", TONE[run.tone])}>{run.status}</span>
                        {run.problem ? <p className="ss-why">{run.problem}</p> : null}
                        {run.raw ? (
                          <details>
                            <summary>Details</summary>
                            <code className="m">{run.raw}</code>
                          </details>
                        ) : null}
                      </td>
                      <td className="r">{run.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
