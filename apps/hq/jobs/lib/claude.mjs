// The Claude client. Shells out to the Claude Code CLI rather than the
// Anthropic API on purpose: the CLI bills against the existing subscription
// through CLAUDE_CODE_OAUTH_TOKEN, and this pipeline is not to run up API
// charges. No API key exists anywhere in HQ.
//
// Lockdown (review M1): the model reads untrusted web text, so every run gets
//   --tools ""            no tools at all (qualify). The deliverable job passes
//                         "Read,Glob,Grep,Write,Edit" instead: no Bash, no web.
//   --strict-mcp-config   no MCP servers (none are configured, none are loaded)
//   --setting-sources ""  no user/project/local settings, hooks or CLAUDE.md
// and a child env built from scratch: PATH, HOME and the one OAuth token, never
// process.env. The token is read from systemd's $CREDENTIALS_DIRECTORY
// (claude-<handle>), so it is not in jobs.env or in the unit's environment.
//
// Verified against claude 2.1.312 (`claude --help`): --tools, --strict-mcp-config,
// --setting-sources, --permission-mode {dontAsk}, --allowedTools. Older CLIs
// that lack --tools / --setting-sources will exit non-zero, which qualify
// treats as "claude unavailable" (code-only scoring). Needs >= 2.1.312.
//
// Jobs never import this directly — it is injected, so tests never spawn it.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

// Exported so tests can stub the spawn. The CLI may be absent (ENOENT): the
// caller (jobs/qualify.mjs) falls back to the code-only score.
export const run = promisify(execFile);

// Whose subscription a run is billed to. Anything else is refused.
export const HANDLES = ["nate", "brandon"];

// Trimmed contents of $CREDENTIALS_DIRECTORY/claude-<handle>. Throws (before
// any spawn) on an unknown handle, a missing directory or a missing/empty file.
// Messages name the handle and path, never the token.
export async function readToken(handle, env = process.env, read = readFile) {
  if (!HANDLES.includes(handle)) throw new Error(`unknown claude handle "${String(handle).slice(0, 40)}"`);
  const dir = env.CREDENTIALS_DIRECTORY;
  if (!dir) throw new Error("CREDENTIALS_DIRECTORY is not set");
  let token;
  try {
    token = (await read(join(dir, `claude-${handle}`), "utf8")).trim();
  } catch {
    throw new Error(`no claude credential for ${handle}`);
  }
  if (!token) throw new Error(`empty claude credential for ${handle}`);
  return token;
}

// tools: the --tools list ("" = none). allowedTools: --allowedTools rules; when
// given, runs under --permission-mode dontAsk so anything unlisted is denied
// (-p mode cannot prompt). cwd: where the CLI runs (the os clone for deliverables).
export function claudeClient({
  handle = "nate",
  model = "sonnet",
  timeout = 120_000,
  tools = "",
  allowedTools,
  cwd,
  env = process.env,
  exec = run,
  read = readFile,
} = {}) {
  return {
    async ask(prompt) {
      const token = await readToken(handle, env, read);
      if (!env.HOME) throw new Error("HOME is not set");
      const args = [
        "-p", prompt,
        "--model", model,
        "--output-format", "json",
        "--tools", tools,
        "--strict-mcp-config",
        "--setting-sources", "",
      ];
      if (allowedTools?.length) args.push("--permission-mode", "dontAsk", "--allowedTools", ...allowedTools);
      const child = exec("claude", args, {
        timeout,
        cwd,
        maxBuffer: 8 * 1024 * 1024,
        env: { PATH: env.PATH ?? "/usr/bin:/bin", HOME: env.HOME, CLAUDE_CODE_OAUTH_TOKEN: token },
      });
      // -p waits 3 s for stdin otherwise; there is nothing to send.
      child.child?.stdin?.end();
      const { stdout } = await child;
      const envelope = JSON.parse(stdout);
      return envelope.result ?? envelope;
    },
  };
}
