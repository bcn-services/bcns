import { getConfig } from "@/lib/env";
import { requireOwner } from "@/lib/session";
import { MintForm } from "./MintForm";

export const dynamic = "force-dynamic";

/** Owner-only: `requireOwner` bounces a member back to Sources with an error. */
export default async function AccessPage() {
  await requireOwner("/");
  // Both browser-safe (NEXT_PUBLIC_*): the sign-in snippet under a minted login needs them.
  const { supabaseUrl, supabaseAnonKey } = getConfig();

  return (
    <>
      <div>
        <h1 className="page-title">
          <b>Access</b>
        </h1>
        <p className="lead">Give your own software — or an AI agent — a login of its own.</p>
      </div>

      <section className="panel" aria-labelledby="agent-h">
        <h2 id="agent-h">Agent login</h2>
        <p className="sub">What it is, and what it can reach</p>
        <div className="body">
          <p className="t">
            An agent login is an ordinary member account for this workspace that belongs to a
            program instead of a person. It signs in with an email and password like anyone else and
            sees exactly the same data you do, scoped by the same rules — no more, and never another
            client&apos;s. Hand it to a script, a reporting job, or an AI assistant so it can read
            your workspace without anybody sharing a personal password. Minting again rotates the
            password; the old password stops working.
          </p>
          <MintForm supabaseUrl={supabaseUrl} anonKey={supabaseAnonKey} />
        </div>
      </section>

      <section className="panel" aria-labelledby="mcp-h">
        <h2 id="mcp-h">MCP server</h2>
        <p className="sub">Connect Claude Code to this workspace</p>
        <p className="t">
          The hosted MCP server at <code className="m">mcp.bcn-services.com</code> lets
          Claude and other agent products read this workspace as the agent login above. Mint a
          login, then follow the steps that appear under it.
        </p>
      </section>
    </>
  );
}
