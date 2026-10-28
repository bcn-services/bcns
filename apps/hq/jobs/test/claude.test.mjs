import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeClient, readToken, HANDLES } from "../lib/claude.mjs";

const ENV = { PATH: "/usr/bin", HOME: "/srv/hq/jobs-state/claude-home", CREDENTIALS_DIRECTORY: "/run/creds", LEAK: "x" };
const reader = (files) => async (p) => {
  if (!(p in files)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return files[p];
};
function stub() {
  const calls = [];
  const exec = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return Promise.resolve({ stdout: JSON.stringify({ result: "ok" }) });
  };
  return { calls, exec };
}

test("argv: -p, --tools \"\", --strict-mcp-config, --setting-sources \"\"; env is exactly PATH HOME CLAUDE_CODE_OAUTH_TOKEN", async () => {
  const s = stub();
  const c = claudeClient({ env: ENV, exec: s.exec, read: reader({ "/run/creds/claude-nate": "tok-n\n" }) });
  assert.equal(await c.ask("hello"), "ok");
  const [{ cmd, args, opts }] = s.calls;
  assert.equal(cmd, "claude");
  assert.deepEqual(args, [
    "-p", "hello", "--model", "sonnet", "--output-format", "json",
    "--tools", "", "--strict-mcp-config", "--setting-sources", "",
  ]);
  assert.deepEqual(Object.keys(opts.env).sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "HOME", "PATH"]);
  assert.equal(opts.env.CLAUDE_CODE_OAUTH_TOKEN, "tok-n");
  assert.equal(opts.env.HOME, "/srv/hq/jobs-state/claude-home");
  assert.ok(!("LEAK" in opts.env) && !("CREDENTIALS_DIRECTORY" in opts.env));
});

test("the token comes from claude-<handle>: brandon reads brandon's file", async () => {
  const s = stub();
  const read = reader({ "/run/creds/claude-nate": "N", "/run/creds/claude-brandon": "B" });
  await claudeClient({ handle: "brandon", env: ENV, exec: s.exec, read }).ask("p");
  assert.equal(s.calls[0].opts.env.CLAUDE_CODE_OAUTH_TOKEN, "B");
});

test("unknown handle is refused before anything is read or spawned", async () => {
  const s = stub();
  for (const handle of ["mallory", "", "../nate", "NATE"]) {
    await assert.rejects(claudeClient({ handle, env: ENV, exec: s.exec, read: reader({}) }).ask("p"), /unknown claude handle/);
  }
  assert.equal(s.calls.length, 0);
  assert.deepEqual(HANDLES, ["nate", "brandon"]);
});

test("missing CREDENTIALS_DIRECTORY / file / empty file throws before spawning, without the token in the message", async () => {
  const s = stub();
  await assert.rejects(claudeClient({ env: { ...ENV, CREDENTIALS_DIRECTORY: undefined }, exec: s.exec }).ask("p"), /CREDENTIALS_DIRECTORY/);
  await assert.rejects(claudeClient({ env: ENV, exec: s.exec, read: reader({}) }).ask("p"), /no claude credential for nate/);
  await assert.rejects(readToken("nate", ENV, reader({ "/run/creds/claude-nate": " \n" })), /empty claude credential/);
  assert.equal(s.calls.length, 0);
});

test("a missing HOME throws before spawning", async () => {
  const s = stub();
  await assert.rejects(
    claudeClient({ env: { ...ENV, HOME: undefined }, exec: s.exec, read: reader({ "/run/creds/claude-nate": "t" }) }).ask("p"),
    /HOME/
  );
  assert.equal(s.calls.length, 0);
});

test("deliverable mode: listed tools, dontAsk, allowedTools, cwd; still strict-mcp and no settings", async () => {
  const s = stub();
  const c = claudeClient({
    env: ENV, exec: s.exec, read: reader({ "/run/creds/claude-nate": "t" }), cwd: "/srv/hq/os",
    tools: "Read,Glob,Grep,Write,Edit", allowedTools: ["Write(clients/a/**)", "Edit(clients/a/**)"],
  });
  await c.ask("p");
  const { args, opts } = s.calls[0];
  assert.equal(opts.cwd, "/srv/hq/os");
  assert.deepEqual(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2), ["--tools", "Read,Glob,Grep,Write,Edit"]);
  assert.ok(args.includes("--strict-mcp-config"));
  assert.deepEqual(args.slice(args.indexOf("--setting-sources")), [
    "--setting-sources", "", "--permission-mode", "dontAsk", "--allowedTools", "Write(clients/a/**)", "Edit(clients/a/**)",
  ]);
  assert.ok(!args.some((a) => /Bash|WebFetch|WebSearch/.test(a)));
});
