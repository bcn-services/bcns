"use client";

import { useState, useTransition } from "react";
import { Button } from "@bcn-services/ui";
import { mintAgentLogin, type MintResult } from "./actions";

/**
 * The password comes back once and lives in React state for that render only.
 * Nothing writes it to localStorage, a cookie or the URL — a reload loses it,
 * which is the intended behaviour: mint again to rotate.
 */
/**
 * Turns the minted email + password into the Bearer header `claude mcp add` takes.
 * The password is never interpolated: `read -rs` takes it off the keyboard, so it is
 * in neither the snippet nor shell history, and the token only ever lives in an env
 * var — history records the literal `$BCNS_TOKEN`, not its value.
 */
function signInSnippet(supabaseUrl: string, anonKey: string, email: string): string {
  const js = [
    'import { createClient } from "@supabase/supabase-js";',
    `const s = createClient(${JSON.stringify(supabaseUrl)}, ${JSON.stringify(anonKey)}, { auth: { persistSession: false } });`,
    `const { data, error } = await s.auth.signInWithPassword({ email: ${JSON.stringify(email)}, password: process.env.BCNS_PW });`,
    "if (error) { console.error(error.message); process.exit(1); }",
    'console.error("token expires " + new Date(data.session.expires_at * 1000).toLocaleString());',
    "console.log(data.session.access_token);",
  ].join("\n");
  // The body sits inside a single-quoted shell word; JSON.stringify doesn't escape
  // `'`, so close-escape-reopen any that appear or the paste runs them as shell.
  const quoted = js.replaceAll("'", "'\\''");
  return [
    "# 1. Sign in. Paste the password at the silent prompt, then press Enter.",
    'cd "$(mktemp -d)" && npm i --silent @supabase/supabase-js',
    "read -rs BCNS_PW && export BCNS_PW",
    `export BCNS_TOKEN="$(node --input-type=module -e '${quoted}')"`,
    "unset BCNS_PW",
    "",
    "# 2. Register the server with Claude Code.",
    'claude mcp add --transport http bcns https://mcp.bcn-services.com/mcp --header "Authorization: Bearer $BCNS_TOKEN"',
    "unset BCNS_TOKEN",
  ].join("\n");
}

export function MintForm({ supabaseUrl, anonKey }: { supabaseUrl?: string; anonKey?: string }) {
  const [result, setResult] = useState<MintResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(await mintAgentLogin());
            })
          }
        >
          {pending ? "Minting…" : result?.ok ? "Mint a new agent login" : "Mint agent login"}
        </Button>
      </div>

      {result && !result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.message}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-4 text-sm">
          <p className="font-medium text-primary">
            Copy this now — the password is shown once and is not stored anywhere.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-mono break-all">{result.email}</dd>
            <dt className="text-muted-foreground">Password</dt>
            <dd className="font-mono break-all">{result.password}</dd>
          </dl>
        </div>
      ) : null}

      {result?.ok && supabaseUrl && anonKey ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">Connect Claude Code</p>
          <p className="text-muted-foreground">
            The MCP server takes a short-lived token, not the password. Run this in your own
            terminal: it signs in as the agent and hands the token to Claude Code.
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs">
            {signInSnippet(supabaseUrl, anonKey, result.email)}
          </pre>
          <p className="text-muted-foreground">
            The token expires about an hour after sign-in (step 1 prints the exact time), and
            Claude Code keeps the one you gave it. When the tools stop answering, run{" "}
            <code className="font-mono">claude mcp remove bcns</code> and both steps again.
          </p>
        </div>
      ) : null}
    </div>
  );
}
