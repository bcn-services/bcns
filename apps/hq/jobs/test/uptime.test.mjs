import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, check, urlFor, TARGETS, KEEP_DAYS } from "../uptime.mjs";
import { main } from "../run.mjs";

// A sql tag that records the statement text and values, and answers delete with a row count.
function fakeSql() {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return text.startsWith("delete") ? Object.assign([], { count: 3 }) : [];
  };
  return { sql, calls };
}

const res = (status) => ({ status });

test("urls: https://<slug>.bcn-services.com/api/health on sb, connect, mcp, hq and ta", () => {
  assert.deepEqual(TARGETS, ["sb", "connect", "mcp", "hq", "ta"]);
  assert.equal(urlFor("ta"), "https://ta.bcn-services.com/api/health");
  assert.equal(urlFor("sb"), "https://sb.bcn-services.com/api/health");
});

test("run writes one uptime_checks row per target and prunes to 7 days", async () => {
  const { sql, calls } = fakeSql();
  const seen = [];
  const fetchStub = async (url, opts) => {
    seen.push(url);
    assert.equal(opts.redirect, "manual");
    assert.ok(opts.signal, "every request has a timeout signal");
    return url.includes("//mcp.") ? res(502) : res(200);
  };
  const out = await run({ sql, fetch: fetchStub });
  assert.deepEqual(seen.sort(), TARGETS.map(urlFor).sort());
  const inserts = calls.filter((c) => c.text.startsWith("insert into uptime_checks"));
  assert.equal(inserts.length, 5);
  const byTarget = Object.fromEntries(inserts.map((c) => [c.values[0], c.values]));
  assert.deepEqual(byTarget.sb.slice(0, 3), ["sb", true, 200]);
  assert.deepEqual(byTarget.mcp.slice(0, 3), ["mcp", false, 502]);
  const del = calls.at(-1);
  assert.match(del.text, /^delete from uptime_checks where checked_at < now\(\) - make_interval/);
  assert.deepEqual(del.values, [KEEP_DAYS]);
  assert.equal(KEEP_DAYS, 7);
  assert.deepEqual(out, { checked: 5, down: ["mcp"], pruned: 3 });
});

test("a refused, timed-out or redirected target is a result, not a thrown job error", async () => {
  const { sql, calls } = fakeSql();
  const fetchStub = async (url) => {
    if (url.includes("//sb.")) throw new Error("ECONNREFUSED");
    if (url.includes("//ta.")) return res(302);
    return res(204);
  };
  const out = await run({ sql, fetch: fetchStub });
  assert.deepEqual(out.down.sort(), ["sb", "ta"]);
  const sbRow = calls.find((c) => c.values[0] === "sb");
  assert.deepEqual(sbRow.values.slice(0, 3), ["sb", false, null]);
  assert.equal(calls.filter((c) => c.text.startsWith("insert")).length, 5);
});

test("a hung request is cut off by the timeout", async () => {
  // AbortSignal.timeout's timer is unref'd (a real socket keeps node alive); the stub needs a ref'd one.
  const keepAlive = setTimeout(() => {}, 2000);
  const hang = (url, { signal }) =>
    new Promise((_, rej) => signal.addEventListener("abort", () => rej(signal.reason)));
  const r = await check("hq", { fetchImpl: hang, timeoutMs: 20 });
  clearTimeout(keepAlive);
  assert.equal(r.ok, false);
  assert.equal(r.status, null);
  assert.ok(r.latency_ms >= 0);
});

test("a database failure fails the run (the dead app is data, a dead db is not)", async () => {
  const sql = async () => {
    throw new Error("db down");
  };
  await assert.rejects(run({ sql, fetch: async () => res(200) }), /db down/);
});

test("run.mjs knows the uptime job and records the run", async () => {
  const events = [];
  const sql = Object.assign(async () => [], { end: async () => {} });
  const db = { logEvent: async (_s, job, kind, detail) => events.push({ job, kind, detail }) };
  const code = await main({
    argv: ["uptime"],
    env: {},
    deps: { sql, db, load: async () => ({ run: async () => ({ checked: 5 }) }) },
  });
  assert.equal(code, 0);
  assert.equal(events[0].job, "uptime");
  assert.equal(events[0].kind, "run");
});

test("infra/hq-uptime.timer fires hq-job@uptime.service every 5 minutes", () => {
  const t = readFileSync(
    fileURLToPath(new URL("../../../../infra/hq-uptime.timer", import.meta.url)),
    "utf8"
  );
  assert.match(t, /^OnCalendar=\*:0\/5$/m);
  assert.match(t, /^Unit=hq-job@uptime\.service$/m);
  assert.match(t, /^WantedBy=timers\.target$/m);
});
