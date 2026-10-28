// QA checks for item B, fix round 1. Independent of the engineer's stubs where it
// matters: real git repos (+ bare origin), a git-argv recorder around execFile,
// a real child process for the claude CLI, and a clean-filter canary that proves
// the .git tamper vector is real before asserting the guard stops it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { run as deliverable, createGit } from "../deliverable.mjs";
import { claudeClient } from "../lib/claude.mjs";
import { isPrivateAddr, guardedLookup, assertPublicUrl } from "../lib/fetch-page.mjs";
import { run as qualify } from "../qualify.mjs";
import { main } from "../run.mjs";

const execP = promisify(execFile);
const tmp = (p) => mkdtempSync(join(tmpdir(), p));
const gitIn = (d, ...a) =>
  execFileSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "pipe" }).toString();

function repo({ origin = true, rejectPush = false } = {}) {
  const d = tmp("qa-os-");
  gitIn(d, "init", "-q");
  mkdirSync(join(d, "clients"));
  mkdirSync(join(d, "knowledge"));
  writeFileSync(join(d, "knowledge/a.md"), "keep");
  writeFileSync(join(d, "clients/.keep"), "");
  writeFileSync(join(d, ".gitignore"), "*.swp\n");
  gitIn(d, "add", ".");
  gitIn(d, "commit", "-qm", "init");
  let bare;
  if (origin) {
    bare = tmp("qa-origin-");
    execFileSync("git", ["init", "--bare", "-q", bare]);
    gitIn(d, "remote", "add", "origin", bare);
    gitIn(d, "push", "-q", "-u", "origin", "HEAD");
    if (rejectPush) writeFileSync(join(bare, "hooks/pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  }
  return { d, bare };
}
const put = (d, rel, body = "<html></html>") => {
  mkdirSync(dirname(join(d, rel)), { recursive: true });
  writeFileSync(join(d, rel), body);
};
const demo = (d) => put(d, "clients/blue-ridge/demo/demo.html");
const ROW = { id: "r1", slug: "blue-ridge", kind: "pitch", requested_by: "u1", feedback: null };

// A real createGit whose every git subprocess is recorded by argv (after the -c/-C prelude).
function rig({ d, bare }, { writes = () => {}, others = [], stateDir = tmp("qa-state-"), row = ROW } = {}) {
  const log = []; // git subcommands in order, with "ASK" marking the claude step
  const rec = async (cmd, args, opts) => {
    log.push(args.filter((a, i) => !(a === "-c" || a === "-C" || args[i - 1] === "-c" || args[i - 1] === "-C")).join(" "));
    return execP(cmd, args, opts);
  };
  const git = createGit({ osDir: d, stateDir, run: rec });
  const out = { finish: [], requeued: [], asks: 0 };
  const db = {
    failStaleDeliverables: async () => [],
    claimDeliverable: async () => (row ? [row] : []),
    otherRunning: async () => others,
    requeueDeliverable: async (_s, id) => out.requeued.push(id),
    finishDeliverable: async (_s, id, r) => out.finish.push({ id, ...r }),
    profileHandle: async () => [{ handle: "nate" }],
    leadForSlug: async () => [{ name: "Blue Ridge" }],
    clientForSlug: async () => [],
  };
  const claudeFor = () => ({
    ask: async () => {
      out.asks++;
      log.push("ASK");
      await writes(d);
    },
  });
  return { out, log, stateDir, go: () => deliverable({ sql: {}, db, claudeFor, git, osDir: d }), after: () => log.slice(log.indexOf("ASK") + 1) };
}

// --- (b) the guard, on real git ---------------------------------------------

test("tamper via a clean-filter driver: the vector fires without the guard, and with it no git command runs, the row is failed, the lock holds", async () => {
  const canaryDir = tmp("qa-canary-");
  const canary = join(canaryDir, "fired");
  const tamper = (d) => {
    writeFileSync(join(d, ".git/info/attributes"), "* filter=canary\n");
    appendFileSync(join(d, ".git/config"), `[filter "canary"]\n\tclean = touch ${canary}; cat\n`);
  };

  // Negative control: the same tamper, an unguarded publish. If this does not fire, the test below proves nothing.
  const ctl = repo();
  demo(ctl.d);
  tamper(ctl.d);
  await createGit({ osDir: ctl.d, stateDir: tmp("qa-state-") }).publish({ slug: "blue-ridge", kind: "pitch" }).catch(() => {});
  assert.ok(existsSync(canary), "control: the filter driver must run on an unguarded `git add`");
  rmSync(canary);

  const r = repo();
  const h = rig(r, { writes: (d) => { demo(d); tamper(d); } });
  const out = await h.go();
  assert.equal(out.status, "failed");
  assert.equal(out.error, "git metadata changed");
  assert.deepEqual(h.after(), [], "no git command after the claude step");
  assert.ok(!existsSync(canary), "the planted filter never ran");
  assert.ok(existsSync(join(h.stateDir, "git-meta-changed")), "marker written");
  assert.ok(existsSync(join(r.d, "clients/blue-ridge/demo/demo.html")), "tree left for Nate, not discarded through the tampered config");
  assert.equal(gitIn(r.bare, "rev-list", "--count", "HEAD").trim(), "1", "nothing pushed");
  assert.equal(h.out.finish.at(-1).status, "failed");

  // Next run refuses before spawning claude or running any git command.
  const again = rig(r, { stateDir: h.stateDir, writes: demo });
  const o2 = await again.go();
  assert.match(o2.error, /git metadata changed in an earlier run/);
  assert.equal(again.out.asks, 0);
  assert.deepEqual(again.log, [], "no git command at all while the marker exists");
  assert.ok(!existsSync(canary));

  // Nate's recovery: undo the tamper, delete the marker -> the dirty clone is discarded and the job works again.
  writeFileSync(join(r.d, ".git/info/attributes"), "");
  rmSync(join(r.d, ".git/info/attributes"));
  const cfg = readFileSync(join(r.d, ".git/config"), "utf8").split('[filter "canary"]')[0];
  writeFileSync(join(r.d, ".git/config"), cfg);
  rmSync(join(h.stateDir, "git-meta-changed"));
  const ok = rig(r, { stateDir: h.stateDir, writes: demo });
  const o3 = await ok.go();
  assert.equal(o3.status, "done", JSON.stringify(o3));
  assert.deepEqual(o3.paths, ["clients/blue-ridge/demo/demo.html"]);
  assert.equal(gitIn(r.bare, "rev-list", "--count", "HEAD").trim(), "2");
});

test(".git/config edit during the claude step (core.fsmonitor / a new section) fails the row with zero further git", async () => {
  const r = repo();
  const h = rig(r, { writes: (d) => { demo(d); appendFileSync(join(d, ".git/config"), "[core]\n\tfsmonitor = /bin/true\n"); } });
  const out = await h.go();
  assert.equal(out.error, "git metadata changed");
  assert.deepEqual(h.after(), []);
  assert.ok(existsSync(join(h.stateDir, "git-meta-changed")));
});

test("an ignored file outside clients/<slug>/ is a violation: removed, nothing committed or pushed", async () => {
  const r = repo();
  const h = rig(r, { writes: (d) => { demo(d); put(d, "knowledge/notes.swp", "x"); } });
  const out = await h.go();
  assert.equal(out.status, "failed");
  assert.match(out.error, /wrote outside clients\/blue-ridge\/: .*knowledge\/notes\.swp/);
  assert.ok(!existsSync(join(r.d, "knowledge/notes.swp")), "ignored file removed by the discard");
  assert.ok(!existsSync(join(r.d, "clients/blue-ridge")), "the in-slug file is discarded too");
  assert.equal(gitIn(r.d, "status", "--porcelain", "--ignored"), "");
  assert.ok(!h.after().some((c) => /^(add|commit|push)\b/.test(c)), `no add/commit/push: ${h.after()}`);
  assert.equal(gitIn(r.bare, "rev-list", "--count", "HEAD").trim(), "1");
});

test("push rejected (pre-receive refuses): the commit and files are dropped, the tree equals @{u}, the push error is the row's error", async () => {
  const r = repo({ rejectPush: true });
  const h = rig(r, { writes: demo });
  const out = await h.go();
  assert.equal(out.status, "failed");
  assert.ok(out.error && out.error !== "claude wrote no files");
  assert.equal(gitIn(r.d, "rev-parse", "HEAD").trim(), gitIn(r.d, "rev-parse", "@{u}").trim());
  assert.equal(gitIn(r.d, "status", "--porcelain", "--ignored"), "");
  assert.ok(!existsSync(join(r.d, "clients/blue-ridge")));
  const a = h.after();
  assert.equal(a[a.indexOf("push") + 1], "reset --hard -q @{u}", `the command right after the failed push is the reset to the upstream: ${a}`);
});

test("push rejected as non-fast-forward (origin moved): same cleanup, and a later run is not poisoned by the dropped commit", async () => {
  const r = repo();
  const other = tmp("qa-other-");
  execFileSync("git", ["clone", "-q", r.bare, other]);
  writeFileSync(join(other, "x.txt"), "x");
  gitIn(other, "add", ".");
  gitIn(other, "commit", "-qm", "someone else");
  gitIn(other, "push", "-q");
  const h = rig(r, { writes: demo });
  const out = await h.go();
  assert.equal(out.status, "failed");
  assert.match(out.error, /^Command failed: git .* push$/);
  assert.equal(gitIn(r.d, "rev-list", "--count", "@{u}..HEAD").trim(), "0");
  assert.equal(gitIn(r.d, "status", "--porcelain", "--ignored"), "");
  // Nate refreshes the clone by hand; the next run publishes only its own file.
  gitIn(r.d, "pull", "-q", "--ff-only");
  const next = rig(r, { writes: demo });
  const o2 = await next.go();
  assert.equal(o2.status, "done");
  assert.equal(gitIn(r.d, "show", "--stat", "--format=", "HEAD").trim().split("\n").length, 2); // one file + summary line
});

test("dirty at start, no other row running: leftovers (untracked, modified, ignored) are discarded BEFORE claude runs and never published", async () => {
  const r = repo();
  put(r.d, "clients/old/leftover.html", "stale");
  writeFileSync(join(r.d, "knowledge/a.md"), "edited");
  put(r.d, "knowledge/z.swp", "x");
  let seen;
  const h = rig(r, {
    writes: (d) => {
      seen = gitIn(d, "status", "--porcelain", "--ignored");
      demo(d);
    },
  });
  const out = await h.go();
  assert.equal(seen, "", "the clone was clean when claude started");
  assert.equal(out.status, "done");
  assert.deepEqual(out.paths, ["clients/blue-ridge/demo/demo.html"]);
  assert.equal(readFileSync(join(r.d, "knowledge/a.md"), "utf8"), "keep");
  assert.ok(!existsSync(join(r.d, "clients/old")));
  assert.equal(gitIn(r.d, "show", "--stat", "--format=", "HEAD").includes("leftover"), false);
});

test("dirty at start while another row is running: the row is requeued, claude never runs, the tree is untouched", async () => {
  const r = repo();
  put(r.d, "clients/old/leftover.html", "stale");
  const h = rig(r, { writes: demo, others: [{ id: "other" }] });
  const out = await h.go();
  assert.deepEqual(out, { claimed: 0, busy: true });
  assert.deepEqual(h.out.requeued, ["r1"]);
  assert.equal(h.out.asks, 0);
  assert.deepEqual(h.out.finish, []);
  assert.ok(existsSync(join(r.d, "clients/old/leftover.html")));
  assert.ok(!h.log.some((c) => /^(reset|clean|add|commit|push)\b/.test(c)), `read-only git only: ${h.log}`);
});

// --- (c) claude CLI as a real child process --------------------------------

function fakeClaude(script) {
  const bin = tmp("qa-bin-");
  const f = join(bin, "claude");
  writeFileSync(f, `#!${process.execPath}\n${script}`);
  chmodSync(f, 0o755);
  return bin;
}
const credsDir = (handle, token) => {
  const c = tmp("qa-creds-");
  writeFileSync(join(c, `claude-${handle}`), `${token}\n`, { mode: 0o600 });
  return c;
};

test("real child: exact argv, env keys are exactly PATH HOME CLAUDE_CODE_OAUTH_TOKEN, the answer comes back", async () => {
  const out = tmp("qa-out-");
  const bin = fakeClaude(`
    const fs = require("fs");
    fs.writeFileSync(${JSON.stringify(join(out, "argv"))}, JSON.stringify(process.argv.slice(2)));
    fs.writeFileSync(${JSON.stringify(join(out, "env"))}, JSON.stringify(Object.keys(process.env).filter((k) => !k.startsWith("__CF")).sort()));
    process.stdout.write(JSON.stringify({ is_error: false, result: "hello" }));
  `);
  const env = { PATH: bin, HOME: "/tmp/qa-home", CREDENTIALS_DIRECTORY: credsDir("nate", "tok-NATE-123"), SECRET_LEAK: "no", DATABASE_URL: "no" };
  const answer = await claudeClient({ handle: "nate", env }).ask("PROMPT");
  assert.equal(answer, "hello");
  const argv = JSON.parse(readFileSync(join(out, "argv"), "utf8"));
  for (const [flag, val] of [["--tools", ""], ["--setting-sources", ""]]) assert.equal(argv[argv.indexOf(flag) + 1], val, flag);
  assert.ok(argv.includes("--strict-mcp-config"));
  assert.equal(argv[0], "-p");
  assert.deepEqual(JSON.parse(readFileSync(join(out, "env"), "utf8")), ["CLAUDE_CODE_OAUTH_TOKEN", "HOME", "PATH"]);
});

test("real child: exit 0 with is_error:true throws without the token (a 401 echoing it is masked)", async () => {
  const token = "tok-SECRET-abc123";
  const bin = fakeClaude(`process.stdout.write(JSON.stringify({ is_error: true, result: "Failed to authenticate. Invalid bearer token ${token} (401)" }));`);
  const env = { PATH: bin, HOME: "/tmp/qa-home", CREDENTIALS_DIRECTORY: credsDir("brandon", token) };
  await assert.rejects(claudeClient({ handle: "brandon", env }).ask("p"), (e) => {
    assert.match(e.message, /^claude reported an error: Failed to authenticate/);
    assert.ok(!e.message.includes(token), e.message);
    assert.ok(e.message.includes("[token]"));
    assert.ok(e.message.length <= 160);
    return true;
  });
});

test("qualify still falls back to code-only scoring when the claude CLI reports is_error (and asks only once)", async () => {
  const bin = fakeClaude(`process.stdout.write(JSON.stringify({ is_error: true, result: "401" }));`);
  const env = { PATH: bin, HOME: "/tmp/qa-home", CREDENTIALS_DIRECTORY: credsDir("nate", "tok-xyz") };
  const claude = claudeClient({ handle: "nate", env });
  let asks = 0;
  const counted = { ask: (p) => (asks++, claude.ask(p)) };
  const biz = (id) => ({ id, name: "Harbor Lane Bookkeeping", domain: "harborlane.example.invalid", phone: "phone-fixture-1", state: "CT", trade: "bookkeepers", research: { rating: 4.8 } });
  const updates = [];
  const page =
    '<html><body><p>Harbor Lane Bookkeeping, family run since 1998, serves Milford CT.</p><script src="https://cdn.shopify.com/s/files/1/x/theme.js"></script><iframe src="https://calendly.com/harborlane/30min"></iframe></body></html>';
  const res = await qualify({
    sql: {},
    clock: () => Date.UTC(2026, 9, 24, 12),
    db: {
      logEvent: async () => {},
      sourcedBacklog: async () => [biz("b1"), biz("b2")],
      updateBusiness: async (_s, id, patch) => (updates.push({ id, patch }), []),
      promotedToday: async () => [{ count: 0 }],
      promoteQualified: async () => [],
    },
    fetchPage: async (url) => {
      if (url.replace(/^https:\/\/[^/]+/, "") === "") return page;
      throw new Error("404");
    },
    claude: counted,
  });
  assert.equal(res.qualified, 2);
  assert.equal(res.errors, 0);
  assert.equal(asks, 1);
  assert.ok(updates.every((u) => u.patch.research.scored_by === "code"));
  assert.ok(updates.every((u) => u.patch.stage === "qualified"));
});

// --- (d) ::ffff:0:0/96 ------------------------------------------------------

test("::ffff:0:127.0.0.1 and every spelling of IPv4-translated is blocked; public v6 and mapped-public stay allowed", async () => {
  for (const a of ["::ffff:0:127.0.0.1", "::ffff:0:7f00:1", "0:0:0:0:ffff:0:7f00:1", "0000:0000:0000:0000:ffff:0000:7f00:0001", "::FFFF:0:127.0.0.1", "::ffff:0:10.0.0.1", "::ffff:0:169.254.169.254", "::ffff:0:8.8.8.8", "::ffff:0:0:0"])
    assert.equal(isPrivateAddr(a), true, a);
  // still blocked / still allowed as before
  for (const a of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::1", "::", "fe80::1", "fd00::1", "64:ff9b::7f00:1", "2002:7f00:1::1"]) assert.equal(isPrivateAddr(a), true, a);
  for (const a of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "8.8.8.8"]) assert.equal(isPrivateAddr(a), false, a);
  // connect-time: the resolver answers with it, no connection is made
  const lookup = guardedLookup((_h, _o, cb) => cb(null, [{ address: "::ffff:0:127.0.0.1", family: 6 }]));
  const err = await new Promise((res) => lookup("rebind.example.com", {}, (e) => res(e)));
  assert.match(String(err?.message), /blocked host/);
  await assert.rejects(assertPublicUrl("https://rebind.example.com/", async () => [{ address: "::ffff:0:127.0.0.1", family: 6 }]), /blocked host/);
});

// --- (e) run.mjs event logging ----------------------------------------------

function runRig(rowsQueued) {
  const events = [];
  const finished = [];
  const sql = { end: async () => {} };
  const db = {
    logEvent: async (_s, job, kind, detail) => events.push({ job, kind, detail }),
    failStaleDeliverables: async () => [],
    claimDeliverable: async () => rowsQueued,
    otherRunning: async () => [],
    requeueDeliverable: async () => [],
    finishDeliverable: async (_s, id, r) => finished.push({ id, ...r }),
    profileHandle: async () => [{ handle: "nate" }],
    leadForSlug: async () => [],
    clientForSlug: async () => [],
  };
  return { events, finished, argv: { argv: ["deliverable"], env: { DATABASE_URL: "x" }, deps: { sql, db, job: { osDir: "/nonexistent", git: {}, claudeFor: () => ({ ask: async () => { throw new Error("no"); } }) } } } };
}

test("run.mjs through the real deliverable job: an empty queue logs no run event; a claimed-and-failed row still logs one", async () => {
  const idle = runRig([]);
  assert.equal(await main(idle.argv), 0);
  assert.deepEqual(idle.events, [], "idle {claimed:0} writes nothing");

  const bad = runRig([{ id: "r9", slug: "Bad Slug", kind: "pitch", requested_by: "u1" }]);
  assert.equal(await main(bad.argv), 0); // the job handled it: row failed, process ok
  assert.equal(bad.finished[0].status, "failed");
  assert.equal(bad.events.length, 1);
  assert.deepEqual([bad.events[0].job, bad.events[0].kind, bad.events[0].detail.ok], ["deliverable", "run", true]);
});

test("run.mjs: a throwing job still logs the run (ok:false, exit 1)", async () => {
  const r = runRig([]);
  r.argv.deps.db.failStaleDeliverables = async () => { throw new Error("db down"); };
  assert.equal(await main(r.argv), 1);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].detail.ok, false);
});
