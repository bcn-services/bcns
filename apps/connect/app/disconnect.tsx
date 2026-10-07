import { disconnectCopy, disconnectPath, type Disconnectable } from "@/lib/sources";

/**
 * The owner Disconnect control, shared by the Sources card and the source page.
 * Two steps without JS: the summary opens the confirm, the button inside submits.
 * Callers gate it with canDisconnect and pass googleSiblingConnected (lib/sources.ts).
 */
export function DisconnectControl({ source, siblingConnected }: { source: Disconnectable; siblingConnected: boolean | null }) {
  return (
    <details className="disc">
      <summary>Disconnect</summary>
      <form action={disconnectPath(source)} method="POST">
        {disconnectCopy(source, { siblingConnected }).map((line) => (
          <p key={line}>{line}</p>
        ))}
        <button type="submit" className="btn btn-sm btn-danger">
          Disconnect and delete data
        </button>
      </form>
    </details>
  );
}
