import { AI_SETTINGS_FAILED, readShareContact } from "@/lib/ai-settings";
import { requireOwner } from "@/lib/session";
import { starterQuestions } from "@/lib/first-run";
import type { HealthRow } from "@/lib/sources";
import { CopyUrl } from "./copy-url";
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
  const [{ share, known }, health] = await Promise.all([
    readShareContact(api),
    api.from("connector_health_v1").select("source,status,last_run_at,last_success_at,last_error"),
  ]);
  const groups = starterQuestions((health.data as HealthRow[] | null) ?? []);

  return (
    <>
      <section className="phead" aria-labelledby="access-h">
        <h1 id="access-h" className="page-title">
          Access
        </h1>
      </section>

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
        <h2 id="connect-h">Connect an assistant</h2>
        <div className="body">
          <CopyUrl url={MCP_URL} />
          <div className="asst">
            <details className="pop pop-btn pop-w" name="assistant">
              <summary>Claude</summary>
              <div className="pop-b">
                <ol className="steps" role="list">
                  <li>Open claude.ai and go to Settings, then Connectors.</li>
                  <li>Choose Add custom connector.</li>
                  <li>Name it bcns and paste the address.</li>
                  <li>Choose Add, then sign in with your bcns Connect email and password.</li>
                  <li>Start a new chat and ask a question.</li>
                </ol>
              </div>
            </details>
            <details className="pop pop-btn pop-w" name="assistant">
              <summary>ChatGPT</summary>
              <div className="pop-b">
                <p className="pop-h">
                  ChatGPT <span className="tag">Not yet hand-verified</span>
                </p>
                <ol className="steps" role="list">
                  <li>Open ChatGPT and go to Settings, then Connectors. You may need to turn on developer mode first.</li>
                  <li>Choose to create a new connector and paste the address.</li>
                  <li>Sign in with your bcns Connect email and password when asked.</li>
                  <li>Start a new chat, turn the connector on for it, and ask a question.</li>
                </ol>
                <p className="pop-n">We have not walked through these screens ourselves yet, and ChatGPT changes them often, so the names may differ.</p>
              </div>
            </details>
            <details className="pop pop-btn pop-w" name="assistant">
              <summary>Claude Code</summary>
              <div className="pop-b">
                Run this in your terminal. Then start Claude Code, type /mcp, choose bcns and sign in.
                <pre className="code">{`claude mcp add --transport http bcns ${MCP_URL}`}</pre>
              </div>
            </details>
          </div>
          <div className="hd">
            <span className="mu">Read-only · every request logged</span>
            <details className="pop pop-w">
              <summary aria-label="About what assistants can see">?</summary>
              <div className="pop-b">
                The assistant can only read: it can&apos;t change or delete anything. It sees only this
                business&apos;s data, and every request it makes is logged. Messages, notes and product
                text come from other people, so point the assistant only at tools you trust.
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="ask-h">
        <h2 id="ask-h">Try asking</h2>
        <div className="body">
          {groups.length === 0 ? (
            <p className="sub">Connect a source to get questions here.</p>
          ) : (
            groups.map((g) => (
              <div key={g.source} className="qg" data-source={g.source}>
                <h3 className="grp">{g.title}</h3>
                <ul className="qs" role="list">
                  {g.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="share-h">
        <div className="srow">
          <div>
            <div className="hd">
              <h2 id="share-h">Customer contact info</h2>
              <details className="pop pop-w">
                <summary aria-label="About customer contact info">?</summary>
                <div className="pop-b">
                  Turning this on makes customer email addresses visible to connected AI assistants. Off:
                  the AI sees customer names and totals but not the email addresses on your customer list.
                  Messages and notes can still contain addresses people typed in.
                </div>
              </details>
            </div>
            <p className="sub">
              {known
                ? share
                  ? "On · AI assistants can see customer emails"
                  : "Off · AI assistants can't see customer emails"
                : "Current setting unknown"}
            </p>
          </div>
          {/* Each form submits an absolute value, so an owner can always turn it off, even
              when the current value couldn't be read. */}
          <div className="flex flex-wrap gap-2">
            {(known ? [share ? "off" : "on"] : ["on", "off"]).map((value) => (
              <form key={value} action={setShareCustomerContact}>
                <input type="hidden" name="share" value={value} />
                <button type="submit" className={known || value === "off" ? "btn" : "btn btn-out"}>
                  {value === "on" ? "Turn on" : "Turn off"}
                </button>
              </form>
            ))}
          </div>
        </div>
        {known ? null : (
          <p role="alert" className="note note-alert">
            Couldn&apos;t check the current setting. You can still turn it on or off.
          </p>
        )}
      </section>
    </>
  );
}
