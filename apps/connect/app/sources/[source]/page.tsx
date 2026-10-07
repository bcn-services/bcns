import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@bcn-services/ui";
import { loadClient, requireHub } from "@/lib/session";
import { formatDateTime } from "@/lib/data-format";
import { BCNS_EMAIL } from "@/lib/request-connection";
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

  const [settings, runs] = await Promise.all([
    api.rpc("source_settings_v1"),
    api.rpc("connector_runs_v1", { p_source: source }),
  ]);
  const page = sourcePage({
    source,
    settings: settings.data as SettingsRow[] | null,
    runs: runs.data as RunRow[] | null,
    role: membership.role,
    now: new Date(),
  });
  const ok = searchParams.ok ? OK_MESSAGES[searchParams.ok] : undefined;

  return (
    <>
      <div>
        <p className="crumb">
          <Link href="/#sources">Sources</Link>
        </p>
        <h1 className="page-title">
          <b>{page.title}</b>
        </h1>
        <p className="lead">What this source is connected to, and how its recent syncs went.</p>
      </div>

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
        <div className="sc-h">
          <h2 className="sc-t">
            <span className="dot" aria-hidden="true" />
            Status
          </h2>
          <span className={cn("st", page.connected ? (page.syncRunning ? "st-warn" : "st-ok") : "st-idle")}>
            {page.connected ? (page.syncRunning ? "Syncing now" : "Connected") : "Not connected"}
          </span>
        </div>
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
        ) : (
          <p className="meta">
            This source isn&apos;t connected. <Link href="/#sources">Connect it from the Sources page.</Link>
          </p>
        )}
        {page.shopSwitchByEmail && page.connected ? (
          <p className="meta">
            To switch to a different Shopify store, <a href={`mailto:${BCNS_EMAIL}`}>email us</a>.
          </p>
        ) : null}
      </article>

      {page.resync ? (
        <section className="panel" aria-labelledby="resync-h">
          <h2 id="resync-h">Sync everything again</h2>
          <p className="sub">
            Pulls all of this source&apos;s history again, starting on the next sync, within the hour. Use it if something
            looks missing. Once an hour at most.
          </p>
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
          <h2 id="folder-h">Change folder</h2>
          <p className="sub">
            Paste the link to the Google Drive folder {source === "meet" ? "your meeting notes are saved in" : "to bring in"}.
            The folder is checked on the next sync, within the hour.
            {source === "drive" ? " Files that are not in the new folder are removed from your workspace." : null}
          </p>
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
                placeholder="https://drive.google.com/drive/folders/…" />
            </label>
            <button type="submit" className="btn btn-sm" disabled={page.syncRunning}>
              Save folder
            </button>
          </form>
        </section>
      ) : null}

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
    </>
  );
}
