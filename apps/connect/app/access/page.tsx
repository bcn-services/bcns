import { AI_SETTINGS_FAILED, readShareContact } from "@/lib/ai-settings";
import { requireOwner } from "@/lib/session";
import { setShareCustomerContact } from "./actions";

export const dynamic = "force-dynamic";

const MCP_URL = "https://mcp.bcn-services.com/mcp";

/** Owner-only: `requireOwner` bounces a member back to Sources with an error. */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { api } = await requireOwner("/");
  const { share, known } = await readShareContact(api);

  return (
    <>
      <div>
        <h1 className="page-title">
          <b>Access</b>
        </h1>
        <p className="lead">Let an AI assistant look at your business data, and choose what it can see.</p>
      </div>

      {searchParams.ok === "saved" ? (
        <p role="status" className="note">
          Saved.
        </p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="note note-alert">
          {searchParams.error === "forbidden" ? "Only an owner can change this." : AI_SETTINGS_FAILED}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="connect-h">
        <h2 id="connect-h">Connect an AI assistant</h2>
        <p className="sub">Each team member signs in with their own bcns Connect email and password.</p>
        <div className="body">
          <div className="conn">
            <p className="h">Claude.ai</p>
            <p>
              Open Settings, then Connectors, then Add custom connector. Paste this address and sign
              in with your bcns Connect email and password.
            </p>
            <pre className="code">{MCP_URL}</pre>
          </div>
          <div className="conn">
            <p className="h">ChatGPT (best effort)</p>
            <p>
              Open Settings, then Connectors (you may need to turn on developer mode), and add the
              same address. ChatGPT changes these screens often, so the names may differ.
            </p>
          </div>
          <div className="conn">
            <p className="h">Claude Code</p>
            <p>Run this in your terminal, then sign in when it asks.</p>
            <pre className="code">{`claude mcp add --transport http bcns ${MCP_URL}`}</pre>
          </div>
          <p className="t">
            The assistant can only read: it can&apos;t change or delete anything. It sees only this
            business&apos;s data, and every request it makes is logged. Messages, notes and product
            text come from other people, so point the assistant only at tools you trust.
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="share-h">
        <h2 id="share-h">Let AI see customer contact info</h2>
        <p className="sub">Currently {share ? "on" : "off"}</p>
        <div className="body">
          <p className="t">
            Turning this on makes customer email addresses visible to connected AI assistants. Off,
            they still see customer names and totals, but no email addresses.
          </p>
          {known ? null : (
            <p role="alert" className="note note-alert">
              Couldn&apos;t check the current setting, so it&apos;s shown as off.
            </p>
          )}
          <form action={setShareCustomerContact}>
            <input type="hidden" name="share" value={share ? "off" : "on"} />
            <button type="submit" className="btn">
              {share ? "Turn off" : "Turn on"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
