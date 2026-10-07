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
        <h2 id="connect-h">Ask Claude or ChatGPT about your business</h2>
        <p className="sub">
          Add your workspace once, then ask questions in plain English. Each team member signs in
          with their own bcns Connect email and password.
        </p>
        <div className="body">
          <div className="conn">
            <p className="h">Your workspace address</p>
            <p>You will paste this into Claude or ChatGPT below.</p>
            <CopyUrl url={MCP_URL} />
          </div>
          <div className="conn">
            <p className="h">In Claude</p>
            <ol className="steps">
              <li>Open claude.ai and go to Settings, then Connectors.</li>
              <li>Choose Add custom connector.</li>
              <li>Name it bcns and paste the address above.</li>
              <li>Choose Add, then sign in with your bcns Connect email and password.</li>
              <li>Start a new chat and ask a question. Try one from the list below.</li>
            </ol>
          </div>
          <div className="conn">
            <p className="h">
              In ChatGPT <span className="tag">Not yet hand-verified</span>
            </p>
            <ol className="steps">
              <li>Open ChatGPT and go to Settings, then Connectors. You may need to turn on developer mode first.</li>
              <li>Choose to create a new connector and paste the address above.</li>
              <li>Sign in with your bcns Connect email and password when asked.</li>
              <li>Start a new chat, turn the connector on for it, and ask a question.</li>
            </ol>
            <p>We have not walked through these screens ourselves yet, and ChatGPT changes them often, so the names may differ.</p>
          </div>
          <div className="conn">
            <p className="h">In Claude Code</p>
            <p>Run this in your terminal. Then start Claude Code, type /mcp, choose bcns and sign in.</p>
            <pre className="code">{`claude mcp add --transport http bcns ${MCP_URL}`}</pre>
          </div>
          <p className="t">
            The assistant can only read: it can&apos;t change or delete anything. It sees only this
            business&apos;s data, and every request it makes is logged. Messages, notes and product
            text come from other people, so point the assistant only at tools you trust.
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="ask-h">
        <h2 id="ask-h">Questions to try</h2>
        {groups.length === 0 ? (
          <p className="sub">
            Connect a source on the Sources page and you will see questions here that your data can answer.
          </p>
        ) : (
          <>
            <p className="sub">Plain questions your connected sources can answer. Copy one into your chat.</p>
            <div className="body">
              {groups.map((g) => (
                <div key={g.source} className="conn" data-source={g.source}>
                  <p className="h">{g.title}</p>
                  <ul className="qs">
                    {g.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="share-h">
        <h2 id="share-h">Let AI see customer contact info</h2>
        <p className="sub">{known ? `Currently ${share ? "on" : "off"}` : "Current setting unknown"}</p>
        <div className="body">
          <p className="t">
            Turning this on makes customer email addresses visible to connected AI assistants. Off:
            the AI sees customer names and totals but not the email addresses on your customer list.
            Messages and notes can still contain addresses people typed in.
          </p>
          {known ? null : (
            <p role="alert" className="note note-alert">
              Couldn&apos;t check the current setting. You can still turn it on or off below.
            </p>
          )}
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
      </section>
    </>
  );
}
